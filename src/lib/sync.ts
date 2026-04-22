/**
 * Local-first sync engine for Quran Reader.
 *
 * Strategy:
 *   - All writes go to localStorage IMMEDIATELY (zero latency, works offline).
 *   - Each value is tagged with a local timestamp in `${key}_ts`.
 *   - If a Supabase session exists, writes are debounced then pushed up.
 *   - On sign-in (or app load with existing session), we reconcile:
 *     per-record last-write-wins based on timestamps.
 *
 * The existing app writes localStorage directly with keys qr_*. To
 * participate in sync, the call sites should go through writeLocal()
 * instead — which does the same localStorage.setItem plus stamps a
 * timestamp plus fires a 'qr:data-changed' event. The sync engine
 * listens for that event to trigger a debounced push.
 *
 * If Supabase is not configured, writeLocal() still works — it just
 * writes localStorage and no one listens for the event. Site behaves
 * identically to the pre-sync build.
 */
import { getSupabase, isConfigured } from './supabase';

export type SyncKey = 'bookmarks' | 'last_read' | 'reading_settings' | 'prayer_settings';

// Map SyncKey → (localStorage key, Supabase column pair)
const MAP: Record<SyncKey, { ls: string; col: string; tsCol: string }> = {
  bookmarks:        { ls: 'qr_bookmarks_v1',         col: 'bookmarks',         tsCol: 'bookmarks_updated_at' },
  last_read:        { ls: 'qr_last_read',            col: 'last_read',         tsCol: 'last_read_updated_at' },
  reading_settings: { ls: 'qr_reading_settings_v1',  col: 'reading_settings',  tsCol: 'reading_settings_updated_at' },
  prayer_settings:  { ls: 'qr_prayer_settings_v1',   col: 'prayer_settings',   tsCol: 'prayer_settings_updated_at' },
};

function tsKey(key: SyncKey) { return `${MAP[key].ls}_ts`; }

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function readLocal<T>(key: SyncKey): T | null {
  try { return safeParse<T>(localStorage.getItem(MAP[key].ls)); } catch { return null; }
}
export function getLocalTs(key: SyncKey): number {
  try { return Number(localStorage.getItem(tsKey(key)) || 0); } catch { return 0; }
}

/**
 * Write a value to localStorage, stamp the timestamp, and notify the
 * sync engine. Safe to call whether or not sync is configured.
 */
export function writeLocal<T>(key: SyncKey, value: T, ts: number = Date.now()): void {
  try {
    localStorage.setItem(MAP[key].ls, JSON.stringify(value));
    localStorage.setItem(tsKey(key), String(ts));
    window.dispatchEvent(new CustomEvent('qr:data-changed', { detail: { key, ts } }));
  } catch (e) {
    // Quota exceeded or access denied — nothing useful to do
    console.warn('writeLocal failed:', e);
  }
}

/** Status channel for the sync badge */
export type SyncStatus = 'offline' | 'signed_out' | 'syncing' | 'synced' | 'error';
let currentStatus: SyncStatus = 'signed_out';
function setStatus(s: SyncStatus) {
  currentStatus = s;
  window.dispatchEvent(new CustomEvent('qr:sync-status', { detail: { status: s } }));
}
export function getSyncStatus(): SyncStatus { return currentStatus; }

let pushTimer: number | null = null;
let reconcileInFlight: Promise<void> | null = null;

/**
 * Intercept localStorage.setItem for any of the sync'd qr_* keys, stamp
 * a timestamp, and dispatch the change event. This lets the existing
 * inline scripts (surah page, awqat, reading settings) participate in
 * sync without any refactor — they keep calling localStorage.setItem
 * like before, and this interceptor does the sync-adjacent bookkeeping.
 */
function installLocalStorageInterceptor() {
  // Reverse map: localStorage key → SyncKey
  const lsToSyncKey: Record<string, SyncKey> = {};
  for (const k of Object.keys(MAP) as SyncKey[]) lsToSyncKey[MAP[k].ls] = k;

  const proto = Object.getPrototypeOf(localStorage);
  const original = proto.setItem;
  if ((original as any).__qrWrapped) return;
  const wrapped = function (this: Storage, key: string, value: string) {
    original.call(this, key, value);
    const syncKey = lsToSyncKey[key];
    if (syncKey) {
      const ts = Date.now();
      original.call(this, `${key}_ts`, String(ts));
      window.dispatchEvent(new CustomEvent('qr:data-changed', { detail: { key: syncKey, ts } }));
    }
  };
  (wrapped as any).__qrWrapped = true;
  proto.setItem = wrapped;
}

/**
 * Initialise sync. Call once from BaseLayout. No-op if Supabase env
 * vars are missing.
 */
export function initSync() {
  // Always install the interceptor so local writes get a timestamp —
  // even without Supabase. Timestamp is cheap and lets us enable sync
  // later without data loss.
  try { installLocalStorageInterceptor(); } catch {}

  if (!isConfigured()) { setStatus('signed_out'); return; }
  const sb = getSupabase();
  if (!sb) { setStatus('signed_out'); return; }

  // Online/offline tracking
  const markOffline = () => { if (currentStatus !== 'signed_out') setStatus('offline'); };
  const markBackOnline = () => { tryReconcileFromSession(); };
  window.addEventListener('offline', markOffline);
  window.addEventListener('online', markBackOnline);

  // Auth state changes
  sb.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      reconcile(session.user.id);
    } else {
      setStatus('signed_out');
    }
  });

  // Debounced push on any local change
  window.addEventListener('qr:data-changed', (e: any) => {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = window.setTimeout(() => pushDirty(e.detail?.key as SyncKey), 1200);
  });

  // Initial session check
  tryReconcileFromSession();
}

async function tryReconcileFromSession() {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { data } = await sb.auth.getSession();
    if (data.session?.user) {
      await reconcile(data.session.user.id);
    } else {
      setStatus('signed_out');
    }
  } catch {
    setStatus('error');
  }
}

/**
 * Merge local state with cloud state — last-write-wins per record.
 * Bookmarks are an exception: we union the two arrays by (s,a) and take
 * the larger ts per pair, so you don't lose bookmarks made offline on
 * two devices.
 */
async function reconcile(userId: string): Promise<void> {
  if (reconcileInFlight) return reconcileInFlight;
  reconcileInFlight = (async () => {
    const sb = getSupabase();
    if (!sb) return;
    setStatus('syncing');
    try {
      const { data: cloud, error } = await sb
        .from('user_data')
        .select('bookmarks, bookmarks_updated_at, last_read, last_read_updated_at, reading_settings, reading_settings_updated_at, prayer_settings, prayer_settings_updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;

      // Build the upsert payload based on per-key merge decisions
      const payload: Record<string, any> = { user_id: userId };
      let anyChange = false;

      for (const k of Object.keys(MAP) as SyncKey[]) {
        const { col, tsCol, ls } = MAP[k];
        const localValue = readLocal<any>(k);
        const localTs = getLocalTs(k);
        const cloudValue = cloud ? (cloud as any)[col] : null;
        const cloudTsRaw = cloud ? (cloud as any)[tsCol] : null;
        const cloudTs = cloudTsRaw ? new Date(cloudTsRaw).getTime() : 0;

        // Special case: bookmarks union
        if (k === 'bookmarks' && Array.isArray(localValue) && Array.isArray(cloudValue)) {
          const merged = unionBookmarks(localValue, cloudValue);
          const mergedTs = Math.max(localTs, cloudTs) || Date.now();
          // Write merged to local
          if (!arrayEquals(merged, localValue)) {
            localStorage.setItem(ls, JSON.stringify(merged));
            localStorage.setItem(`${ls}_ts`, String(mergedTs));
          }
          // Push if different from cloud
          if (!arrayEquals(merged, cloudValue)) {
            payload[col] = merged;
            payload[tsCol] = new Date(mergedTs).toISOString();
            anyChange = true;
          }
          continue;
        }

        // Default: newest timestamp wins
        if (cloudTs > localTs && cloudValue != null) {
          // Cloud is newer → overwrite local
          localStorage.setItem(ls, JSON.stringify(cloudValue));
          localStorage.setItem(`${ls}_ts`, String(cloudTs));
          // Notify listeners so UI refreshes (e.g. reading settings theme)
          window.dispatchEvent(new CustomEvent('qr:data-cloud-pulled', { detail: { key: k, value: cloudValue } }));
        } else if (localTs > cloudTs && localValue != null) {
          payload[col] = localValue;
          payload[tsCol] = new Date(localTs).toISOString();
          anyChange = true;
        } else if (cloudTs === 0 && localTs === 0 && localValue != null) {
          // Both empty — if local has a value but no ts, stamp & push
          const now = Date.now();
          localStorage.setItem(`${ls}_ts`, String(now));
          payload[col] = localValue;
          payload[tsCol] = new Date(now).toISOString();
          anyChange = true;
        }
      }

      if (anyChange) {
        const { error: pushErr } = await sb.from('user_data').upsert(payload);
        if (pushErr) throw pushErr;
      }
      setStatus('synced');
    } catch (e) {
      console.warn('sync: reconcile failed', e);
      setStatus('error');
    } finally {
      reconcileInFlight = null;
    }
  })();
  return reconcileInFlight;
}

async function pushDirty(changedKey?: SyncKey) {
  const sb = getSupabase();
  if (!sb) return;
  if (!navigator.onLine) { setStatus('offline'); return; }
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user) { setStatus('signed_out'); return; }
    setStatus('syncing');
    const payload: Record<string, any> = { user_id: session.user.id };

    // If a specific key changed, push just that; otherwise push all.
    const keys: SyncKey[] = changedKey ? [changedKey] : (Object.keys(MAP) as SyncKey[]);
    for (const k of keys) {
      const v = readLocal<any>(k);
      const ts = getLocalTs(k) || Date.now();
      if (v == null) continue;
      payload[MAP[k].col] = v;
      payload[MAP[k].tsCol] = new Date(ts).toISOString();
    }
    const { error } = await sb.from('user_data').upsert(payload);
    if (error) throw error;
    setStatus('synced');
  } catch (e) {
    console.warn('sync: push failed', e);
    setStatus('error');
  }
}

/** Union two bookmark arrays by (s,a) pair, taking the larger ts per pair. */
function unionBookmarks(
  a: Array<{ s: number; a: number; ts: number }>,
  b: Array<{ s: number; a: number; ts: number }>,
): Array<{ s: number; a: number; ts: number }> {
  const byKey = new Map<string, { s: number; a: number; ts: number }>();
  for (const b1 of [...a, ...b]) {
    if (!b1 || typeof b1.s !== 'number' || typeof b1.a !== 'number') continue;
    const key = `${b1.s}:${b1.a}`;
    const existing = byKey.get(key);
    if (!existing || (b1.ts || 0) > (existing.ts || 0)) byKey.set(key, b1);
  }
  return Array.from(byKey.values()).sort((x, y) => (y.ts || 0) - (x.ts || 0));
}

function arrayEquals(a: any[], b: any[]): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Sign in via email magic link. Redirects to /auth/callback/ on success. */
export async function signInWithMagicLink(email: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase not configured' };
  const redirectTo = `${window.location.origin}/auth/callback/`;
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
  setStatus('signed_out');
}

export async function getCurrentUserEmail(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data?.user?.email ?? null;
}

export async function deleteAccount(): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Not configured' };
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { ok: false, error: 'Not signed in' };
    // RLS DELETE policy permits this — cascades to auth.users via fkey
    await sb.from('user_data').delete().eq('user_id', user.id);
    // Note: we can't delete auth.users from client (no privilege) — but the
    // practical impact is just an empty shell; user can request deletion via
    // the privacy page contact.
    await sb.auth.signOut();
    setStatus('signed_out');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Delete failed' };
  }
}
