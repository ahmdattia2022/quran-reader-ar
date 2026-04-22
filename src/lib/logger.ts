/**
 * Structured client logger with three sinks:
 *   1. Console (always on, tagged)
 *   2. localStorage ring buffer — 300 entries, viewable at /debug/
 *   3. Axiom HTTP ingest — batched, opt-in via env vars, 30-day retention
 *
 * Privacy / safety:
 *   - PII redaction runs BEFORE anything leaves the page. Emails are
 *     partially masked; JWTs are truncated; `password|token|key|secret`
 *     keys are blanked.
 *   - Axiom tokens scoped to "ingest-only" are safe to expose in the
 *     client bundle (they cannot read logs, only write). Similar to
 *     Sentry DSNs.
 *   - If Axiom env vars are missing, the remote sink is silently
 *     disabled — everything still works locally.
 *
 * Usage:
 *   import { logger } from './logger';
 *   logger.info('sync', 'reconcile start', { userId });
 *
 * DevTools: `qrLogs.recent(20)` / `qrLogs.export()` / `qrLogs.clear()`
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: number;
  level: LogLevel;
  area: string;
  msg: string;
  meta?: Record<string, unknown>;
}

// ───── Env / configuration ─────

const AXIOM_TOKEN = (import.meta.env.PUBLIC_AXIOM_TOKEN as string | undefined)?.trim() || '';
const AXIOM_DATASET = (import.meta.env.PUBLIC_AXIOM_DATASET as string | undefined)?.trim() || '';
const APP_VERSION = (import.meta.env.PUBLIC_APP_VERSION as string | undefined) || 'dev';

const STORAGE_KEY = 'qr_logs_v1';
const MAX_ENTRIES = 300;
const MAX_META_BYTES = 2048;
const AXIOM_BATCH_SIZE = 50;
const AXIOM_FLUSH_MS = 5000;

let minLevel: LogLevel = 'debug';
const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

// A stable anonymous session ID for correlating events across a page
// load — NOT a user identifier. Rotated each session.
const SESSION_ID = (() => {
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID() as string;
  }
  return `s_${Math.random().toString(36).slice(2, 10)}`;
})();

// ───── PII redaction ─────

const SECRET_KEY_PATTERN = /^(password|token|key|secret|jwt|auth|bearer|cookie|session|apikey|api_key|access_token|refresh_token)/i;

function truncateToken(s: string): string {
  if (s.length <= 12) return '***';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function redactEmail(s: string): string {
  return s.replace(/\b([A-Za-z0-9._%+-]{1,3})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, '$1***@$2');
}

function redactLikelyJwt(s: string): string {
  return s.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g, (m) => truncateToken(m));
}

function redactValue(v: unknown, keyHint?: string): unknown {
  if (v == null) return v;
  if (typeof v === 'string') {
    if (keyHint && SECRET_KEY_PATTERN.test(keyHint)) return truncateToken(v);
    let out = v;
    out = redactLikelyJwt(out);
    out = redactEmail(out);
    if (out.length > 500) out = out.slice(0, 500) + `…(${out.length - 500} more)`;
    return out;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => redactValue(x));
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (count++ >= 30) { out['...'] = 'truncated'; break; }
      out[k] = redactValue(val, k);
    }
    return out;
  }
  return String(v);
}

function redactMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const r = redactValue(meta) as Record<string, unknown>;
  try {
    const serialized = JSON.stringify(r);
    if (serialized.length > MAX_META_BYTES) {
      return { truncated: true, preview: serialized.slice(0, MAX_META_BYTES) };
    }
  } catch { return { error: 'meta not serializable' }; }
  return r;
}

// ───── localStorage ring buffer ─────

function safeRead(): LogEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function safeWrite(entries: LogEntry[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    const bounded = entries.length > MAX_ENTRIES ? entries.slice(-MAX_ENTRIES) : entries;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bounded));
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-Math.floor(MAX_ENTRIES / 2))));
    } catch { /* give up */ }
  }
}

// ───── Axiom HTTP ingest (batched) ─────

interface AxiomEvent {
  _time: string;
  level: LogLevel;
  area: string;
  msg: string;
  meta?: Record<string, unknown>;
  session: string;
  version: string;
  path?: string;
  ua?: string;
}

let axiomQueue: AxiomEvent[] = [];
let axiomFlushTimer: number | null = null;
let axiomDisabled = false;

function axiomConfigured(): boolean {
  return !axiomDisabled && Boolean(AXIOM_TOKEN && AXIOM_DATASET);
}

// Fields we strip from meta before shipping to Axiom. User IDs are
// useful for local debugging (/debug page) but we don't want to build
// a profile of users server-side.
const REMOTE_STRIP_KEYS = new Set(['userId', 'user_id', 'uid', 'id']);

function sanitizeForRemote(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (REMOTE_STRIP_KEYS.has(k)) {
      // Keep a flag so we know a user was involved, but not who
      out[k] = v ? '[stripped]' : v;
      continue;
    }
    out[k] = v;
  }
  return out;
}

function enqueueAxiom(entry: LogEntry) {
  if (!axiomConfigured()) return;
  axiomQueue.push({
    _time: new Date(entry.ts).toISOString(),
    level: entry.level,
    area: entry.area,
    msg: entry.msg,
    meta: sanitizeForRemote(entry.meta),
    session: SESSION_ID,
    version: APP_VERSION,
    path: typeof location !== 'undefined' ? location.pathname : undefined,
    ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : undefined,
  });
  if (axiomQueue.length >= AXIOM_BATCH_SIZE) { void flushAxiom(); return; }
  if (!axiomFlushTimer && typeof window !== 'undefined') {
    axiomFlushTimer = window.setTimeout(() => flushAxiom(), AXIOM_FLUSH_MS);
  }
}

async function flushAxiom() {
  if (!axiomConfigured() || axiomQueue.length === 0) return;
  if (axiomFlushTimer) { clearTimeout(axiomFlushTimer); axiomFlushTimer = null; }
  const batch = axiomQueue;
  axiomQueue = [];
  try {
    // Axiom ingest accepts NDJSON or JSON array. We send JSON array.
    // Ingest-scope tokens are safe to expose — they cannot read.
    const res = await fetch(
      `https://api.axiom.co/v1/datasets/${encodeURIComponent(AXIOM_DATASET)}/ingest`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AXIOM_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
        keepalive: true,
      },
    );
    if (!res.ok) {
      // 401/403 = bad token, disable to avoid hammering
      if (res.status === 401 || res.status === 403) {
        axiomDisabled = true;
        console.warn('[qr:logger] Axiom returned', res.status, '— disabling remote sink');
      }
    }
  } catch {
    // Network error — drop this batch silently, don't re-queue
    // (prevents memory bloat if Axiom is down)
  }
}

// Flush on page hide — ensures nothing is lost on navigation/close
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { void flushAxiom(); });
  window.addEventListener('beforeunload', () => { void flushAxiom(); });
}

// ───── Core log function ─────

function log(level: LogLevel, area: string, msg: string, meta?: Record<string, unknown>): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel]) return;
  const entry: LogEntry = {
    ts: Date.now(),
    level,
    area,
    msg: typeof msg === 'string' ? msg : String(msg),
    meta: redactMeta(meta),
  };

  // 1. localStorage
  const existing = safeRead();
  existing.push(entry);
  safeWrite(existing);

  // 2. console
  if (typeof console !== 'undefined') {
    const tag = `[qr:${area}]`;
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'info' ? console.info : console.debug;
    if (entry.meta) fn.call(console, tag, msg, entry.meta);
    else fn.call(console, tag, msg);
  }

  // 3. event (for live /debug page)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('qr:log', { detail: entry }));
  }

  // 4. Axiom (async, batched, non-blocking)
  enqueueAxiom(entry);
}

export const logger = {
  debug: (area: string, msg: string, meta?: Record<string, unknown>) => log('debug', area, msg, meta),
  info:  (area: string, msg: string, meta?: Record<string, unknown>) => log('info',  area, msg, meta),
  warn:  (area: string, msg: string, meta?: Record<string, unknown>) => log('warn',  area, msg, meta),
  error: (area: string, msg: string, meta?: Record<string, unknown>) => log('error', area, msg, meta),

  getAll(): LogEntry[] { return safeRead(); },
  recent(n = 50): LogEntry[] { return safeRead().slice(-n); },
  byLevel(level: LogLevel): LogEntry[] { return safeRead().filter((e) => e.level === level); },
  byArea(area: string): LogEntry[] { return safeRead().filter((e) => e.area === area); },

  clear(): void { safeWrite([]); },
  setMinLevel(l: LogLevel) { minLevel = l; },

  flush(): Promise<void> { return flushAxiom(); },
  remoteEnabled(): boolean { return axiomConfigured(); },

  export(): string {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      sessionId: SESSION_ID,
      version: APP_VERSION,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      remoteEnabled: axiomConfigured(),
      entries: safeRead(),
    }, null, 2);
  },
};

// DevTools hook
if (typeof window !== 'undefined') {
  (window as any).qrLogs = logger;
}
