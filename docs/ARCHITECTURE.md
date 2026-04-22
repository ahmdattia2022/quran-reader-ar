# Architecture

A map of how everything fits together. Start here if you want to understand the system before poking at deploy steps.

---

## High-level diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        User's browser                            │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ Static HTML  │    │ localStorage │    │  Service Worker   │  │
│  │ (Astro SSG)  │◀──▶│  bookmarks,  │    │  offline cache    │  │
│  │ 758 pages    │    │  last_read,  │    │  + PWA install    │  │
│  │              │    │  settings,   │    │                   │  │
│  └──────┬───────┘    │  prayer loc, │    └──────────────────┘  │
│         │            │  logs (300)  │                            │
│         │            └──────────────┘                            │
│         │                    ▲                                    │
│         ▼                    │                                    │
│  ┌──────────────────────────┴──────────────┐                   │
│  │      Client JS bundles (per-page)        │                   │
│  │  • sync.ts   (local-first, LWW)          │                   │
│  │  • adhan     (prayer times, ~14 KB)      │                   │
│  │  • supabase  (auth + DB, ~60 KB gz)      │                   │
│  │  • logger.ts (Axiom ingest, PII redact)  │                   │
│  └──┬──────────┬──────────────┬─────────────┘                   │
└─────┼──────────┼──────────────┼──────────────────────────────────┘
      │          │              │
      ▼          ▼              ▼
 ┌──────────┐ ┌─────────┐  ┌──────────┐
 │Cloudflare│ │Supabase │  │  Axiom   │
 │  Pages   │ │ (opt-in)│  │ (opt-in) │
 │ (free)   │ │  free   │  │   free   │
 │          │ │ tier    │  │  tier    │
 │ • Static │ │         │  │          │
 │   HTML   │ │ • Auth  │  │ • Remote │
 │ • CDN    │ │   (magic│  │   logs   │
 │ • HTTPS  │ │   link) │  │ • 30-day │
 │ • Headers│ │ • Postgres│ │   retn'n │
 │          │ │ + RLS   │  │          │
 └──────────┘ └─────────┘  └──────────┘

 ┌──────────────┐     ┌─────────────────────┐
 │ Google Fonts │     │ cdn.islamic.network │
 │ (first load) │     │ (audio, per-ayah)   │
 └──────────────┘     └─────────────────────┘
```

## Guiding principles

1. **Static-first.** Every page is pre-rendered at build time. No SSR, no server-side runtime. This keeps hosting costs at $0 and makes the site stupidly fast.
2. **Local-first.** The app works fully without any backend. Supabase is purely an enhancement for cross-device sync — opt-in, off by default.
3. **Graceful degradation.** If any external service (Supabase, Axiom, Google Fonts, audio CDN) is unavailable, the core experience still works. Features fail softly.
4. **Privacy by default.** No analytics, no cookies, no tracking. When we DO send data outside the browser (Axiom logs, Supabase sync), it's opt-in, documented, and PII-redacted.
5. **Correctness for religious content.** SHA-256 hash of data files is published so users can verify the Quran text hasn't been modified. Build-time integrity check catches tampering.

## Build pipeline

```
┌──────────────┐
│ npm run build│
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  prebuild                                                    │
│  ┌──────────────────────────────┐                           │
│  │ node scripts/gen-pwa-icons   │ → public/icon-*.png      │
│  │ node scripts/build-search-… │ → public/search-index.json│
│  │ node scripts/compute-hash    │ → public/quran-hash.txt  │
│  └──────────────────────────────┘                           │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
              ┌──────────────────────┐
              │      astro build     │
              │ (rolldown / vite)    │
              │ • Render 758 pages   │
              │ • Bundle client JS   │
              │ • Inline critical CSS│
              │ • Sitemap            │
              └──────────┬───────────┘
                         │
                         ▼
                    ┌─────────┐
                    │  dist/  │
                    └─────────┘
```

All env vars (Supabase / Axiom) are baked into the client bundle at this stage via `import.meta.env.PUBLIC_*`.

## Request flow — a typical user visit

```
1. User types quran-reader-ar.pages.dev
2. Cloudflare edge serves index.html from cache (immutable + 1y for /_astro/*)
3. Browser parses HTML, requests JS chunks
4. Client scripts initialize:
   • ReadingSettings → restores font/theme from localStorage before paint
   • initSync() → installs localStorage interceptor, checks for Supabase session
   • PrayerStrip → renders Hijri date immediately; if prayer location saved,
     computes next prayer time via Adhan-js (no network)
   • PWAInstaller → registers service worker, sets install prompt listener
5. User reads. Any write (bookmark, font size change, prayer location):
   • Goes to localStorage immediately (works offline)
   • Interceptor stamps timestamp + dispatches qr:data-changed event
   • Sync engine debounces 1.2s, then pushes to Supabase if signed in
6. User navigates to another surah:
   • Service worker intercepts → network-first → falls back to cache if offline
```

## Data flow — sync engine

```
                            ┌────────────────┐
                            │ User writes    │
                            │ bookmark       │
                            └───────┬────────┘
                                    │
                                    ▼
            ┌───────────────────────────────────────┐
            │ localStorage.setItem(qr_bookmarks_v1) │
            └───────┬───────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────┐
│ Monkey-patched setItem in sync.ts:                │
│   1. call original setItem (real write)           │
│   2. write qr_bookmarks_v1_ts = Date.now()        │
│   3. dispatch CustomEvent('qr:data-changed')      │
└───────┬───────────────────────────────────────────┘
        │
        ▼ (instant)
  ┌─────────────┐
  │ UI updates  │  ← works, even offline, even with no sync
  └─────────────┘
        │
        ▼ (debounced 1.2s)
┌──────────────────────────────────────────────┐
│ flushDirty()                                  │
│   • Not signed in?    → stop, stay 'signed_out'│
│   • Offline?          → stop, stay 'offline'   │
│   • Reconcile running?→ side-Set, flush later  │
│   • Otherwise         → upsert to Supabase     │
└──────────────────────────────────────────────┘
        │
        ▼
  ┌──────────────────┐
  │ Supabase         │
  │ user_data row    │ ← RLS enforces auth.uid() = user_id
  └──────────────────┘
```

Key invariants:
- **Every local write stamps a timestamp.** Without the stamp, we can't reconcile across devices.
- **Reconcile never overwrites a local write made during reconcile.** `dirtyDuringReconcile` side-set tracks writes that happened mid-fetch; they're flushed after reconcile completes.
- **Bookmarks are union-merged, not LWW.** Losing an offline bookmark from device A because device B happened to sync later is unacceptable UX for a religious app.
- **Other keys use per-record LWW.** `reading_settings` and `prayer_settings` use timestamp-per-record; more recent wins.

## Auth flow — magic link

```
User clicks "Sign in"
       │
       ▼
AuthModal shows email input
       │
       ▼
User submits → signInWithMagicLink(email)
       │
       ▼
Supabase sends email via configured SMTP (Resend in our case, not default)
       │
       ▼
User clicks link → https://gqrliszhjueskvhajtvd.supabase.co/auth/v1/verify?token=...
       │
       ▼
Supabase verifies token → redirects to redirect_to allow-listed URL
       │
       ▼
https://quran-reader-ar.pages.dev/auth/callback/
       │
       ▼
  callback.astro client script:
    sb.auth.detectSessionInUrl (built into supabase-js) picks up tokens
       │
       ▼
  Session persisted to localStorage (supabase-js handles this)
       │
       ▼
  onAuthStateChange → SIGNED_IN → reconcile() pulls cloud, merges, pushes
       │
       ▼
  Redirect to /
       │
       ▼
  SyncBadge → "متزامن"
```

## Permission model — Supabase

Two layers, both must allow:

**Layer 1: Table privileges (`GRANT`)** — can the Postgres role touch the table at all?

```sql
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.user_data to authenticated;
```

**Layer 2: Row-level security (`CREATE POLICY`)** — which rows can this role see?

```sql
create policy "own_select" on public.user_data
  for select using (auth.uid() = user_id);
-- (same for insert / update / delete)
```

If Layer 1 fails → `42501 permission denied` (the user never gets to RLS). If Layer 1 passes and Layer 2 fails → zero rows returned (no error, just empty).

The `anon` role (no JWT) gets NO grants on `user_data`. Even if RLS were bypassed, they can't touch the table. Defense in depth.

## Error handling + logging

```
     sync / auth operation fails
              │
              ▼
   ┌──────────────────────────────┐
   │ userFacingError(e, context)  │
   │                              │
   │  ┌────────────────────────┐  │
   │  │ Step 1: logger.error() │  │ → Axiom + localStorage
   │  │  (full context, code,  │  │
   │  │   hint, details)       │  │
   │  └────────────────────────┘  │
   │                              │
   │  ┌────────────────────────┐  │
   │  │ Step 2: match against  │  │
   │  │  whitelisted error     │  │
   │  │  regexes               │  │
   │  └────────────────────────┘  │
   │                              │
   │  ┌────────────────────────┐  │
   │  │ Step 3: return Arabic  │  │ → shown in UI
   │  │  fixed message or      │  │
   │  │  generic fallback      │  │
   │  └────────────────────────┘  │
   └──────────────────────────────┘
```

**Key rule:** raw backend errors **never reach the UI or the network response**. They leak schema, constraint names, SQL fragments, etc. The UI only shows pre-translated Arabic whitelisted messages or a generic `"تعذّر إتمام العملية"`.

## PWA + Service Worker strategy

```
Request type                         | Strategy
─────────────────────────────────────┼────────────────────────────
Navigation (HTML)                    │ network-first, fallback cache
/_astro/* (hashed build output)      │ cache-first (immutable)
*.png / *.svg / *.json / *.txt       │ stale-while-revalidate
cdn.islamic.network (audio)          │ bypass SW entirely
fonts.googleapis / gstatic           │ bypass SW (browser handles)
supabase.co / axiom.co               │ bypass SW (API calls)
```

The service worker (in `public/sw.js`, not using Workbox) is deliberately minimal — no complex runtime caching rules, no precaching of audio. Users who want offline audio can use their OS-level download.

## Security notes

- **No secrets in the bundle.** `PUBLIC_SUPABASE_ANON_KEY` and `PUBLIC_AXIOM_TOKEN` are safe to expose by design (RLS protects DB; Axiom ingest-only tokens are write-only).
- **Service role key is never in the client.** Migrations run from `scripts/migrate.mjs` using the DB password (not stored in the repo, passed via env).
- **PII redaction before every log.** Emails → `ab***@gmail.com`, JWTs truncated, key names like `password|token|secret` blanked.
- **User IDs stripped from Axiom.** localStorage logs keep them (for local debugging), Axiom payloads don't (no server-side user profiling).
- **CSP not yet set.** TODO: add a Content-Security-Policy header in `public/_headers` once we finalize the external-origin list.

## Known limitations

- **Reading settings are whole-object LWW.** Changing font size on one device and theme on another loses one of the changes on next reconcile. To fix: split into per-setting columns + per-setting timestamps.
- **`deleteAccountData` doesn't delete the auth user.** Client can't delete from `auth.users` (no privilege). The data row is removed and the user signs out, but the email account persists in Supabase. Adding a `SECURITY DEFINER` RPC for true account deletion is a follow-up.
- **Supabase free tier pauses after 7 days of zero traffic.** Not an issue while we have daily users; first post-pause request gets a ~5s cold start.
- **Bundle size dominated by Supabase (~190 KB).** Loaded on every page via `BaseLayout`. Could be lazy-loaded behind a "sign in" click, but the trade-off (no auto-resume of existing session on page load) isn't worth it.

## Where to go next

- Operational tasks (rotate tokens, debug sync, run migrations): [`RUNBOOK.md`](RUNBOOK.md)
- Full deploy setup (Cloudflare + Supabase + Axiom): [`DEPLOYMENT.md`](DEPLOYMENT.md)
