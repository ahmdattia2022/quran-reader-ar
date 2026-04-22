/**
 * Local-first sync engine for Quran Reader.
 *
 * Design:
 *   - All writes go to localStorage IMMEDIATELY — zero latency, works offline.
 *   - Each sync'd value gets a timestamp in `${ls_key}_ts`.
 *   - If a Supabase session exists, writes queue into a dirty-keys Set
 *     and get flushed upstream after a 1.2s debounce window (so all
 *     keys changed in a burst go up together, not just the last one).
 *   - On sign-in (or page load with an existing session), reconcile
 *     pulls cloud state, merges with local via per-record last-write-wins,
 *     and pushes the delta back. Bookmarks are union-merged (never lose
 *     a bookmark made offline on two devices).
 *   - During reconcile, user writes are captured in a side-set and
 *     flushed after reconcile completes — so a bookmark added mid-fetch
 *     isn't overwritten by stale cloud data.
 *
 * If Supabase env vars are missing, the interceptor still stamps
 * timestamps locally (free, preserves the upgrade path), but nothing
 * is sent to the network and the sync badge stays hidden.
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

function tsLsKey(key: SyncKey) { return `${MAP[key].ls}_ts`; }

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function readLocal<T>(key: SyncKey): T | null {
  try { return safeParse<T>(localStorage.getItem(MAP[key].ls)); } catch { return null; }
}
export function getLocalTs(key: SyncKey): number {
  try { return Number(localStorage.getItem(tsLsKey(key)) || 0); } catch { return 0; }
}

// Reference to the native setItem — captured BEFORE the interceptor
// replaces the prototype method. Lets reconcile write back to local
// without triggering the interceptor's dispatch (which would schedule
// a redundant push of data we just pulled from cloud).
let nativeSetItem: ((key: string, value: string) => void) | null = null;

function writeRaw(lsKey: string, value: string) {
  if (nativeSetItem) nativeSetItem.call(localStorage, lsKey, value);
  else localStorage.setItem(lsKey, value);
}

/** Status channel for the sync badge */
export type SyncStatus = 'offline' | 'signed_out' | 'syncing' | 'synced' | 'error';
let currentStatus: SyncStatus = 'signed_out';
function setStatus(s: SyncStatus) {
  currentStatus = s;
  window.dispatchEvent(new CustomEvent('qr:sync-status', { detail: { status: s } }));
}
export function getSyncStatus(): SyncStatus { return currentStatus; }

// ───── Dirty-set based push queue ─────
// `dirtyKeys` accumulates every key that's changed since the last
// successful push. On debounce fire, all of them get pushed together.
const dirtyKeys = new Set<SyncKey>();
let pushTimer: number | null = null;
let reconcileInFlight: Promise<void> | null = null;
// During reconcile, any local writes land here instead of triggering
// a push (reconcile is about to push anyway, and we don't want to race
// with it). Flushed after reconcile completes.
let duringReconcile = false;
const dirtyDuringReconcile = new Set<SyncKey>();

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = window.setTimeout(flushDirty, 1200);
}

async function flushDirty() {
  pushTimer = null;
  if (dirtyKeys.size === 0) return;
  const keys = Array.from(dirtyKeys);
  dirtyKeys.clear();
  await pushKeys(keys);
}

// ───── localStorage interceptor ─────
function installLocalStorageInterceptor() {
  const lsToSyncKey: Record<string, SyncKey> = {};
  for (const k of Object.keys(MAP) as SyncKey[]) lsToSyncKey[MAP[k].ls] = k;

  const proto = Object.getPrototypeOf(localStorage);
  const original = proto.setItem;
  if ((original as any).__qrWrapped) {
    // Already patched (e.g., hot reload). Still capture the native ref
    // if we don't have one yet.
    if (!nativeSetItem) nativeSetItem = (original as any).__qrOriginal || original;
    return;
  }
  nativeSetItem = original;

  const wrapped = function (this: Storage, key: string, value: string) {
    original.call(this, key, value);
    const syncKey = lsToSyncKey[key];
    if (!syncKey) return;
    const ts = Date.now();
    original.call(this, `${key}_ts`, String(ts));
    if (duringReconcile) {
      dirtyDuringReconcile.add(syncKey);
      return;
    }
    dirtyKeys.add(syncKey);
    window.dispatchEvent(new CustomEvent('qr:data-changed', { detail: { key: syncKey, ts } }));
  };
  (wrapped as any).__qrWrapped = true;
  (wrapped as any).__qrOriginal = original;
  proto.setItem = wrapped;
}

/**
 * Initialise sync. Call once from BaseLayout. Safe to call even when
 * Supabase env vars are missing — the interceptor still stamps
 * timestamps locally so enabling sync later doesn't lose data.
 */
export function initSync() {
  try { installLocalStorageInterceptor(); } catch {}

  if (!isConfigured()) { setStatus('signed_out'); return; }
  const sb = getSupabase();
  if (!sb) { setStatus('signed_out'); return; }

  // Online/offline tracking
  const markOffline = () => { if (currentStatus !== 'signed_out') setStatus('offline'); };
  const markBackOnline = () => { void tryReconcileFromSession(); };
  window.addEventListener('offline', markOffline);
  window.addEventListener('online', markBackOnline);

  // Auth state — only reconcile on genuine sign-in events, NOT on every
  // token refresh (which happens hourly and would burn egress).
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      void reconcile(session.user.id);
    } else if (event === 'SIGNED_OUT') {
      dirtyKeys.clear();
      setStatus('signed_out');
    }
    // TOKEN_REFRESHED / USER_UPDATED: no-op. Session is still valid,
    // data is in localStorage, pushes still work.
  });

  // Debounced push on any local change
  window.addEventListener('qr:data-changed', () => { schedulePush(); });

  // Initial session check
  void tryReconcileFromSession();
}

async function tryReconcileFromSession() {
  const sb = getSupabase();
  if (!sb) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setStatus('offline');
    return;
  }
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
 * Merge local state with cloud state via per-record last-write-wins.
 * Bookmarks get union-merged so offline additions on different devices
 * all survive.
 *
 * Race-safe: any local writes made DURING this function are captured
 * in `dirtyDuringReconcile` and flushed after completion, so we never
 * overwrite a fresh local write with stale cloud data.
 */
async function reconcile(userId: string): Promise<void> {
  if (reconcileInFlight) return reconcileInFlight;
  reconcileInFlight = (async () => {
    const sb = getSupabase();
    if (!sb) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatus('offline');
      return;
    }
    setStatus('syncing');
    duringReconcile = true;
    dirtyDuringReconcile.clear();

    try {
      const fetch = sb
        .from('user_data')
        .select('bookmarks, bookmarks_updated_at, last_read, last_read_updated_at, reading_settings, reading_settings_updated_at, prayer_settings, prayer_settings_updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      const { data: cloud, error } = await withTimeout(fetch, 15_000, 'fetch');
      if (error) throw error;

      const payload: Record<string, any> = { user_id: userId };
      let anyChange = false;

      for (const k of Object.keys(MAP) as SyncKey[]) {
        // If the user wrote this key locally WHILE we were fetching,
        // their write is canonical — skip the cloud-pull overwrite and
        // let the post-reconcile flush push the local value up.
        if (dirtyDuringReconcile.has(k)) continue;

        const { col, tsCol, ls } = MAP[k];
        const localValue = readLocal<any>(k);
        const localTs = getLocalTs(k);
        const cloudValue = cloud ? (cloud as any)[col] : null;
        const cloudTsRaw = cloud ? (cloud as any)[tsCol] : null;
        const cloudTs = cloudTsRaw ? new Date(cloudTsRaw).getTime() : 0;

        // Bookmarks: union merge (ts-per-pair)
        if (k === 'bookmarks' && Array.isArray(localValue) && Array.isArray(cloudValue)) {
          const merged = unionBookmarks(localValue, cloudValue);
          const mergedTs = Math.max(localTs, cloudTs) || Date.now();
          if (!arrayEquals(merged, localValue)) {
            // Write via native setItem — bypasses interceptor, no
            // dispatch/push scheduled for data we're about to push ourselves.
            writeRaw(ls, JSON.stringify(merged));
            writeRaw(`${ls}_ts`, String(mergedTs));
            window.dispatchEvent(new CustomEvent('qr:data-cloud-pulled', { detail: { key: k, value: merged } }));
          }
          if (!arrayEquals(merged, cloudValue)) {
            payload[col] = merged;
            payload[tsCol] = new Date(mergedTs).toISOString();
            anyChange = true;
          }
          continue;
        }

        // Default: newest timestamp wins
        if (cloudTs > localTs && cloudValue != null) {
          writeRaw(ls, JSON.stringify(cloudValue));
          writeRaw(`${ls}_ts`, String(cloudTs));
          window.dispatchEvent(new CustomEvent('qr:data-cloud-pulled', { detail: { key: k, value: cloudValue } }));
        } else if (localTs > cloudTs && localValue != null) {
          payload[col] = localValue;
          payload[tsCol] = new Date(localTs).toISOString();
          anyChange = true;
        } else if (cloudTs === 0 && localTs === 0 && localValue != null) {
          // First-time push — stamp now
          const now = Date.now();
          writeRaw(`${ls}_ts`, String(now));
          payload[col] = localValue;
          payload[tsCol] = new Date(now).toISOString();
          anyChange = true;
        }
      }

      if (anyChange) {
        const push = sb.from('user_data').upsert(payload);
        const { error: pushErr } = await withTimeout(push, 15_000, 'push');
        if (pushErr) throw pushErr;
      }
      setStatus('synced');
    } catch (e) {
      console.warn('sync: reconcile failed', e);
      setStatus('error');
    } finally {
      duringReconcile = false;
      // Flush any writes that happened during reconcile
      if (dirtyDuringReconcile.size) {
        for (const k of dirtyDuringReconcile) dirtyKeys.add(k);
        dirtyDuringReconcile.clear();
        schedulePush();
      }
      reconcileInFlight = null;
    }
  })();
  return reconcileInFlight;
}

/**
 * Push the named keys to Supabase. Called from the debounce timer after
 * local writes. Reads current localStorage values at flush time (not at
 * enqueue time) so we always push the latest state.
 */
async function pushKeys(keys: SyncKey[]): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) { setStatus('offline'); return; }

  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user) { setStatus('signed_out'); return; }

    setStatus('syncing');
    const payload: Record<string, any> = { user_id: session.user.id };
    let anything = false;
    for (const k of keys) {
      const v = readLocal<any>(k);
      const ts = getLocalTs(k) || Date.now();
      if (v == null) continue;
      payload[MAP[k].col] = v;
      payload[MAP[k].tsCol] = new Date(ts).toISOString();
      anything = true;
    }
    if (!anything) { setStatus('synced'); return; }

    const upsert = sb.from('user_data').upsert(payload);
    const { error } = await withTimeout(upsert, 15_000, 'push');
    if (error) throw error;
    setStatus('synced');
  } catch (e) {
    console.warn('sync: push failed', e);
    // Restore dirty flags so next change re-triggers the push
    for (const k of keys) dirtyKeys.add(k);
    setStatus('error');
  }
}

/** Union two bookmark arrays by (s,a) pair, taking the larger ts per pair. */
function unionBookmarks(
  a: Array<{ s: number; a: number; ts: number }>,
  b: Array<{ s: number; a: number; ts: number }>,
): Array<{ s: number; a: number; ts: number }> {
  const byKey = new Map<string, { s: number; a: number; ts: number }>();
  for (const item of [...a, ...b]) {
    if (!item || typeof item.s !== 'number' || typeof item.a !== 'number') continue;
    const key = `${item.s}:${item.a}`;
    const existing = byKey.get(key);
    if (!existing || (item.ts || 0) > (existing.ts || 0)) byKey.set(key, item);
  }
  return Array.from(byKey.values()).sort((x, y) => (y.ts || 0) - (x.ts || 0));
}

function arrayEquals(a: unknown[], b: unknown[]): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Wrap a thenable in a timeout so a stalled network doesn't freeze UI. */
function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    Promise.resolve(p).then(
      (v) => { clearTimeout(tid); resolve(v); },
      (e) => { clearTimeout(tid); reject(e); },
    );
  });
}

// ───── Auth helpers ─────

// Maps common Supabase error strings to Arabic. Pattern-matches case-
// insensitively against the message; falls back to raw if no match.
const ERROR_MAP: Array<[RegExp, string]> = [
  [/email rate limit exceeded/i, 'تم تجاوز حد الإرسال. حاول بعد ساعة أو قم بإعداد خادم بريد مخصص.'],
  [/you can only request this (once|\d+ times?) every (\d+)/i, 'لأسباب أمنية، يمكنك طلب رابط دخول مرة واحدة كل دقيقة. انتظر قليلاً ثم حاول.'],
  [/invalid login credentials|invalid email or password/i, 'بيانات الدخول غير صحيحة.'],
  [/user not found/i, 'لم يُعثر على مستخدم بهذا البريد.'],
  [/email link is invalid or has expired/i, 'رابط الدخول غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً.'],
  [/network (request )?failed|failed to fetch/i, 'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مجدداً.'],
  [/signups (not )?allowed|signup disabled/i, 'التسجيل غير مفعّل حالياً.'],
  [/invalid email|email.*invalid/i, 'بريد إلكتروني غير صالح.'],
  [/timeout/i, 'انتهت مهلة الاتصال. حاول مرة أخرى.'],
];
function translateError(msg: string | undefined | null): string {
  const s = String(msg || '').trim();
  if (!s) return 'حدث خطأ غير متوقع.';
  for (const [re, ar] of ERROR_MAP) if (re.test(s)) return ar;
  return s; // unmapped → show raw
}

/** Sign in via email magic link. */
export async function signInWithMagicLink(email: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'المزامنة غير مفعّلة.' };
  const trimmed = String(email || '').trim();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: 'بريد إلكتروني غير صالح.' };
  }
  const redirectTo = `${window.location.origin}/auth/callback/`;
  try {
    const req = sb.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    });
    const { error } = await withTimeout(req, 15_000, 'sign-in');
    if (error) return { ok: false, error: translateError(error.message) };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: translateError(e?.message) };
  }
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
  dirtyKeys.clear();
  setStatus('signed_out');
}

export async function getCurrentUserEmail(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data?.user?.email ?? null;
}

/**
 * Client can delete its own user_data row via RLS, but cannot remove
 * the auth.users record (no client privilege — by design). A proper
 * "full account deletion" requires a Postgres RPC with SECURITY DEFINER
 * that we haven't added yet. For now this deletes the data and signs
 * the user out; if they sign in again with the same email, they get
 * a fresh empty row (behaves as if they're a new user).
 */
export async function deleteAccountData(): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'المزامنة غير مفعّلة.' };
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { ok: false, error: 'غير مسجَّل الدخول.' };
    const { error } = await sb.from('user_data').delete().eq('user_id', user.id);
    if (error) return { ok: false, error: translateError(error.message) };
    await sb.auth.signOut();
    setStatus('signed_out');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: translateError(e?.message) };
  }
}
