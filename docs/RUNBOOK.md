# Runbook

Operational tasks, ordered by frequency. When something breaks, start here.

---

## Table of contents

1. [Check production health](#check-production-health)
2. [View logs](#view-logs)
3. [Debug a sync error](#debug-a-sync-error)
4. [Clear a user's service worker cache](#clear-a-users-service-worker-cache)
5. [Rotate tokens](#rotate-tokens)
6. [Run a Supabase schema migration](#run-a-supabase-schema-migration)
7. [Handle rate limits](#handle-rate-limits)
8. [Monitor free-tier usage](#monitor-free-tier-usage)
9. [Fetch fresh Quran data](#fetch-fresh-quran-data)
10. [Emergency rollback](#emergency-rollback)

---

## Check production health

Quick smoke test — all should return 200:

```bash
for p in / /mushaf/ /mushaf/1/ /juz/ /juz/1/ /awqat/ /search/ /bookmarks/ /about/ /privacy/ /quran-hash.txt /manifest.webmanifest /sw.js; do
  code=$(curl -sI "https://quran-reader-ar.pages.dev${p}" -o /dev/null -w "%{http_code}" --max-time 10)
  echo "${code}  ${p}"
done
```

Content integrity:

```bash
curl -s https://quran-reader-ar.pages.dev/quran-hash.txt
```

Check Axiom for recent errors:

```apl
['quran-reader']
| where level == "error"
| where _time > ago(24h)
| summarize count() by area, msg
```

---

## View logs

### Remote (Axiom dashboard)

1. [app.axiom.co](https://app.axiom.co) → `quran-reader` dataset.
2. **Stream** tab for live tail.
3. **Query** tab for filtering. Examples:

```apl
// All errors in the last hour
['quran-reader']
| where level == "error" and _time > ago(1h)
| sort by _time desc

// Sync failures broken down
['quran-reader']
| where area == "sync" and level == "error"
| summarize count() by msg, ['meta.code']

// Per-session debugging
['quran-reader']
| where session == "e54169ac-137f-4e85-a960-dadd967a6f83"
| sort by _time asc
```

### Local (browser DevTools)

Open the site → F12 → Console:

```js
qrLogs.recent(50)          // last 50 entries
qrLogs.byLevel('error')    // only errors
qrLogs.byArea('sync')      // only sync events
qrLogs.byArea('auth')      // only auth events
qrLogs.export()            // JSON dump for copy-paste to a bug report
qrLogs.clear()             // wipe local buffer
qrLogs.remoteEnabled()     // is Axiom hooked up?
qrLogs.setMinLevel('warn') // raise threshold to reduce noise
```

### User bug reports

Ask the user to open DevTools Console and run `qrLogs.export()`, then paste the output. You get full context: every log entry from their session, user-agent, app version, sync status history.

---

## Debug a sync error

### 1. Confirm the error symptom

User reports badge shows `خطأ في المزامنة` (red/error). Reproduce if possible.

### 2. Check Axiom for the exact error

```apl
['quran-reader']
| where area == "sync" and level == "error" and _time > ago(1h)
| project _time, msg, ['meta.code'], ['meta.msg'], ['meta.hint'], session
| sort by _time desc
| limit 20
```

Common error codes you'll see in `meta.code`:

| Code | Meaning | Fix |
|---|---|---|
| `42501` | permission denied for table | Missing `GRANT` — see schema.sql step 2 |
| `42P01` | undefined table | Schema not applied; run `node scripts/migrate.mjs` |
| `PGRST205` | schema cache miss | Run `NOTIFY pgrst, 'reload schema';` |
| `PGRST301` | JWT expired | Usually self-heals on next page load |
| `42883` | function does not exist | Triggers not installed; re-run schema |
| (no code, `fetch aborted`) | network failure | Check user's internet / Supabase status page |

### 3. If the error is code 42501 (missing grant)

```bash
PGHOST=aws-1-eu-central-1.pooler.supabase.com \
PGPORT=5432 \
PGUSER=postgres.<project-ref> \
PGPASSWORD='<db-password>' \
  node scripts/migrate.mjs supabase/schema.sql
```

Verify grants landed:

```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name='user_data' and grantee='authenticated';
-- Expect: DELETE, INSERT, SELECT, UPDATE (minimum)
```

### 4. If the error is something else

- Paste the Axiom log entry here for review.
- Check Supabase dashboard → Logs → Postgres Logs for server-side context.
- Check that the user's JWT is valid: `sb.auth.getSession()` in their DevTools Console.

---

## Clear a user's service worker cache

When you ship a big change and users are still seeing old HTML:

```js
// Paste into DevTools Console on production site
(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map(r => r.unregister()));
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
  location.reload();
})();
```

Or instruct them: DevTools → **Application** → **Storage** → **Clear site data**.

The service worker version (`CACHE_VERSION` in `public/sw.js`) also auto-invalidates old caches on deploy. Bump it when shipping breaking SW changes.

---

## Rotate tokens

### Supabase anon key

1. Supabase dashboard → Settings → **API** → **Project API keys** → click the "..." menu on `anon public` → **Reveal** → copy.
2. If you want to actually rotate (generate a new one): Settings → **JWT Keys** → **Rotate JWT secret**. This invalidates ALL existing sessions (users will need to sign in again).
3. Update `PUBLIC_SUPABASE_ANON_KEY` in `.env` + Cloudflare Pages environment.
4. Redeploy.

### Axiom ingest token

1. Axiom dashboard → Settings → API Tokens → find `quran-reader-client` → delete.
2. Create new token with same scope (Ingest-only on `quran-reader` dataset).
3. Update `PUBLIC_AXIOM_TOKEN` in `.env` + Cloudflare Pages.
4. Redeploy.

### Supabase database password

1. Supabase dashboard → Settings → **Database** → **Reset database password**.
2. Save the new password in your password manager.
3. Update your local `.env` if you had it there (never commit).
4. No Cloudflare update needed — the client doesn't use the DB password.

### Resend API key (for SMTP)

1. Resend dashboard → API Keys → delete the old one → create a new one (sending access only).
2. Supabase dashboard → Authentication → Emails → SMTP Settings → paste new password → Save.
3. Test by sending yourself a magic link.

---

## Run a Supabase schema migration

1. **Always backup first** (Supabase dashboard → Database → Backups → manual backup; free tier keeps daily snapshots for 7 days).
2. Add changes to `supabase/schema.sql`. Keep statements idempotent (`create table if not exists`, `drop policy if exists ... create policy`, `on conflict do nothing`).
3. Test locally if possible.
4. Run:

```bash
PGHOST=aws-1-eu-central-1.pooler.supabase.com \
PGPORT=5432 \
PGUSER=postgres.<project-ref> \
PGPASSWORD='<db-password>' \
  node scripts/migrate.mjs supabase/schema.sql
```

5. Confirm with a verification query — `migrate.mjs` runs one automatically at the end (lists RLS policies + row counts).
6. Schema cache: the migration itself runs `NOTIFY pgrst, 'reload schema'`. If PostgREST still 404s new tables, manually run that notify in the SQL Editor.

---

## Handle rate limits

### Supabase auth (magic-link emails)

Default SMTP: **3 emails/hour project-wide**. Symptoms: user sees `تم تجاوز حد الإرسال`.

Permanent fix: configure Resend (see [DEPLOYMENT.md § 3.4](DEPLOYMENT.md#34-configure-smtp-required-for-production)). New limit: 100/day, 3k/month.

### Cloudflare bandwidth

Unlimited on free tier. No action needed.

### Axiom ingest

500 MB/month free. At current log volume (~1 MB per 100 active users per month), we'll never hit this. Monitor via Axiom dashboard → Usage.

---

## Monitor free-tier usage

Monthly check (5 min):

| Service | Dashboard | Threshold alert |
|---|---|---|
| Cloudflare Pages | dash.cloudflare.com → Workers & Pages → Project → Analytics | (unlimited — no alert) |
| Supabase | supabase.com → Project → Reports → Infrastructure | > 80% of 500 MB DB; > 40K MAU |
| Axiom | app.axiom.co → Settings → Usage | > 80% of 500 MB ingest |
| Resend | resend.com → Dashboard → Usage | > 80% of 3k/month |

If any approaches its limit, either optimize (reduce logs, compress data) or upgrade (all have paid plans starting ~$10–25/month).

---

## Fetch fresh Quran data

Rarely needed — the data doesn't change. But if alquran.cloud updates:

```bash
npm run fetch:quran          # pulls fresh text + tafsir
npm run hash:quran           # recomputes SHA-256
git diff                     # review — any changes should be legitimate
git commit -am "Update Quran data from alquran.cloud"
# Deploy per normal workflow
```

The content integrity table on `/about/` and `/quran-hash.txt` auto-update at build time.

---

## Emergency rollback

Something is badly broken in production. Undo in <30 seconds:

### Option 1 — Cloudflare dashboard

1. dash.cloudflare.com → Pages → quran-reader-ar → **Deployments**.
2. Find the last known-good deployment.
3. Menu (`…`) → **Rollback to this deployment**.
4. Done. Traffic switches immediately.

### Option 2 — git revert + redeploy

```bash
git log --oneline -5                    # find the bad commit
git revert <bad-sha>                    # creates a revert commit
git push origin main                    # triggers auto-deploy

# OR if Git integration is broken:
npm run build
npx wrangler pages deploy dist --project-name=quran-reader-ar --branch=main
```

### Option 3 — hard reset + force push (last resort)

Only if revert isn't possible (e.g., broken merge commit). Loses history cosmetically.

```bash
git reset --hard <good-sha>
git push --force origin main
# Then redeploy as above
```

Coordinate with collaborators before force-pushing — they'll need to `git reset` their local branches too.

---

## Useful queries / snippets

### Find all signed-in users who had a sync error today

```apl
['quran-reader']
| where area == "sync" and level == "error" and _time > ago(1d)
| summarize errors=count() by session
| where errors >= 3
| sort by errors desc
```

### Count sign-in attempts vs successes (last 24h)

```apl
['quran-reader']
| where area == "auth" and _time > ago(1d)
| summarize
    attempts = countif(msg == "magic link requested"),
    successes = countif(msg == "magic link sent successfully"),
    failures = countif(msg startswith "magic-link error")
```

### Postgres: list all users without a user_data row

```sql
select u.id, u.email, u.created_at
from auth.users u
left join public.user_data ud on ud.user_id = u.id
where ud.user_id is null;
-- Should always be empty (trigger + backfill cover this)
```

### Postgres: find largest user_data rows (near 50KB cap?)

```sql
select user_id,
  octet_length(bookmarks::text) as bm_bytes,
  octet_length(last_read::text) as lr_bytes,
  octet_length(reading_settings::text) as rs_bytes,
  octet_length(prayer_settings::text) as ps_bytes
from public.user_data
order by (
  coalesce(octet_length(bookmarks::text), 0) +
  coalesce(octet_length(last_read::text), 0) +
  coalesce(octet_length(reading_settings::text), 0) +
  coalesce(octet_length(prayer_settings::text), 0)
) desc
limit 10;
```
