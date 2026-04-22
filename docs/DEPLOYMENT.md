# Deployment guide

Everything you need to deploy this project from scratch. Total time: **~20 min**. Total cost: **$0**.

---

## Table of contents

1. [Prerequisites](#prerequisites)
2. [GitHub setup](#1-github-setup)
3. [Cloudflare Pages setup](#2-cloudflare-pages)
4. [Supabase (optional — auth + sync)](#3-supabase-optional)
5. [Axiom (optional — monitoring)](#4-axiom-optional)
6. [Environment variables](#5-environment-variables)
7. [Branching](#branching)
8. [Deployment methods](#deployment-methods)
9. [Custom domain](#custom-domain)
10. [Rollback](#rollback)

---

## Prerequisites

- Node.js 22.12+ (or newer)
- `git` + a GitHub account
- Free accounts on: Cloudflare, Supabase (optional), Axiom (optional), Resend (optional, for proper SMTP)
- Windows/macOS/Linux all work

No credit card is required for any of the free tiers.

---

## 1. GitHub setup

```bash
git clone https://github.com/ahmdattia2022/quran-reader-ar.git
cd quran-reader-ar
npm install
cp .env.example .env
```

Fill in `.env` values as you complete the sections below.

---

## 2. Cloudflare Pages

### Create the project (one-time)

1. Sign in to [Cloudflare dashboard](https://dash.cloudflare.com) (free account, no card).
2. Left sidebar → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select the GitHub repo `ahmdattia2022/quran-reader-ar`. Authorize the Cloudflare GitHub App if prompted.
4. Set:
   - **Project name:** `quran-reader-ar`
   - **Production branch:** `main`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** (leave empty)
5. Click **Save and Deploy**.

Cloudflare will build + deploy. The first deploy takes ~3–5 minutes. Subsequent deploys take ~1–2 minutes.

### If the Git connection is broken

Cloudflare's GitHub App connection occasionally drops (shows banner: "This project is disconnected from your Git account"). Two fixes:

**Option A — reconnect**
1. Project → Settings → **Builds & deployments** → **Source**.
2. Click **Reconnect to Git** → re-authorize Cloudflare to access the repo.

**Option B — direct upload via wrangler** (works even when Git integration is broken)

```bash
npm run build
npx wrangler pages deploy dist \
  --project-name=quran-reader-ar \
  --branch=main \
  --commit-hash=$(git rev-parse --short HEAD) \
  --commit-message="$(git log -1 --pretty=%s)"
```

Wrangler uses OAuth from `wrangler login` — if you haven't authed yet, run that first (opens a browser tab).

---

## 3. Supabase (optional)

Only needed for cross-device sync. Skip this if you just want local-only.

### 3.1 Create project

1. [supabase.com](https://supabase.com) → sign up with GitHub (no card).
2. **New project**:
   - Name: `quran-reader-ar`
   - Region: **Frankfurt (eu-central-1)** (closest free region to Arabic-speaking users)
   - Database password: generate + save somewhere private (password manager)
3. **Important at creation time:**
   - ✅ Enable Data API (on)
   - ❌ Automatically expose new tables and functions (off — we grant explicitly)
   - ✅ Enable automatic RLS (on — defense in depth)
4. **Never add a payment method.** Free tier is enforced as a hard cap without one.

Wait ~1–2 min for provisioning.

### 3.2 Configure auth URL allowlist

Dashboard → **Authentication** → **URL Configuration**:

- **Site URL:** `https://quran-reader-ar.pages.dev`
- **Redirect URLs:** add both
  - `https://quran-reader-ar.pages.dev/**`
  - `http://localhost:4321/**` (for local dev)

Save.

### 3.3 Run the schema

Two options:

**Option A — SQL Editor (manual)**
1. Dashboard → SQL Editor → New query.
2. Paste contents of `supabase/schema.sql` → Run.
3. Confirm "Success. No rows returned".

**Option B — migrate.mjs (automated)**

```bash
# Find which pooler region hosts your project (one-time)
PROJECT_REF=<your-project-ref> PGPASSWORD='<db-password>' node scripts/find-region.mjs

# Note the host from the output, e.g. aws-1-eu-central-1.pooler.supabase.com

PGHOST=aws-1-eu-central-1.pooler.supabase.com \
PGPORT=5432 \
PGUSER=postgres.<your-project-ref> \
PGPASSWORD='<db-password>' \
  node scripts/migrate.mjs supabase/schema.sql
```

Expected output: `✅ migration applied successfully`, 4 RLS policies, N users backfilled.

### 3.4 Configure SMTP (required for production)

Supabase's default SMTP is capped at **3 emails/hour project-wide** — unusable in practice.

Free alternative: **Resend** (100 emails/day, 3k/month).

1. [resend.com](https://resend.com) → sign up with GitHub (no card).
2. Dashboard → API Keys → **Create API Key**:
   - Name: `supabase-quran-reader`
   - Permission: **Sending access** only
3. Copy the `re_...` key.
4. Supabase → **Authentication** → **Emails** (or "SMTP Settings") → Enable Custom SMTP:

   | Field | Value |
   |---|---|
   | Sender email | `onboarding@resend.dev` (or your verified domain) |
   | Sender name | `القرآن الكريم` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | your `re_...` key |

5. Save.

Rate limit becomes Resend's: effectively unlimited for our scale.

### 3.5 Grab the keys

Supabase → Settings → **API**:
- Copy **Project URL** → `PUBLIC_SUPABASE_URL`
- Copy **anon public** key → `PUBLIC_SUPABASE_ANON_KEY`

Both are safe to expose in the client bundle (RLS-protected).

---

## 4. Axiom (optional)

Only needed for remote log monitoring. Skip for a local-only deploy.

### 4.1 Create account + dataset

1. [axiom.co](https://axiom.co) → sign up with GitHub (no card).
2. Create a dataset named `quran-reader`.

### 4.2 Create an ingest-only API token

1. Dashboard → **Settings** → **API Tokens** → **New API Token**.
2. Name: `quran-reader-client`
3. **Critical — permissions:**
   - ✅ **Ingest** — access to your `quran-reader` dataset
   - ❌ **Query** — DO NOT grant this. Query-scope tokens can read all your logs; they're unsafe to expose in a browser bundle.
4. Copy the `xaat-...` token.

### 4.3 Verify

```bash
curl -X POST "https://api.axiom.co/v1/datasets/quran-reader/ingest" \
  -H "Authorization: Bearer xaat-<your-token>" \
  -H "Content-Type: application/json" \
  -d '[{"_time":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","level":"info","area":"setup","msg":"connection test"}]'
```

Expected: `{"ingested":1,"failed":0,...}` + HTTP 200.

Check the Stream tab in Axiom — your test event should appear within seconds.

---

## 5. Environment variables

### Local development (`.env`)

```
PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon-key>
PUBLIC_AXIOM_DATASET=quran-reader
PUBLIC_AXIOM_TOKEN=xaat-<your-token>
PUBLIC_APP_VERSION=dev
```

### Cloudflare Pages (production)

Dashboard → Project → **Settings** → **Variables and Secrets** → **Add variable** (one per env var). Set for "Production" environment. Repeat for "Preview" environment if you want preview deploys to use the same services (or separate ones — see [branching](#branching)).

After adding variables, trigger a rebuild for them to take effect (push a commit or click **Retry deployment**).

---

## Branching

### Model

- **`main`** → production. Auto-deploys to `quran-reader-ar.pages.dev`.
- **`preview`** → staging. Auto-deploys to `preview.quran-reader-ar.pages.dev` (any non-production branch becomes a preview deployment by default on Cloudflare Pages).
- Feature branches → optional; each becomes its own ephemeral preview URL (`feature-xyz.quran-reader-ar.pages.dev`).

### Workflow

```
feature-xyz  →  preview  →  main
   │              │           │
   │              │           └── production (quran-reader-ar.pages.dev)
   │              │
   │              └── staging (preview.quran-reader-ar.pages.dev)
   │
   └── ephemeral preview (feature-xyz.quran-reader-ar.pages.dev)
```

### Configure production branch

Cloudflare dashboard → Project → Settings → **Builds & deployments** → **Branch control**:

- **Production branch:** `main`
- **Preview branches:** "All non-production branches"

### Preview environment variables

If you want `preview` to hit a separate Supabase project (recommended for safety), create a `preview` environment in Cloudflare Pages → Variables and Secrets and set different `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY`.

For single-environment setups (cheapest, easiest), use the same values for both.

---

## Deployment methods

### A. Automatic (Git-connected)

Every push to `main` or `preview` triggers a Cloudflare build. Check the Deployments tab for progress.

### B. Manual (wrangler direct upload)

Used when:
- Git integration is broken
- You want to deploy a specific local build without pushing
- You're debugging a deploy issue

```bash
# Production
npm run build
npx wrangler pages deploy dist \
  --project-name=quran-reader-ar \
  --branch=main \
  --commit-hash=$(git rev-parse --short HEAD) \
  --commit-message="$(git log -1 --pretty=%s)"

# Preview (branch other than main → preview URL)
npx wrangler pages deploy dist \
  --project-name=quran-reader-ar \
  --branch=preview \
  --commit-hash=$(git rev-parse --short HEAD) \
  --commit-message="Preview: $(git log -1 --pretty=%s)"
```

---

## Custom domain

Free options:

- **Cloudflare subdomain:** `quran-reader-ar.pages.dev` (default, free, works immediately).
- **is-a.dev:** apply via GitHub PR → `quran.is-a.dev`. Free, but dev-focused namespace.
- **eu.org:** free, legitimate, approval takes 1–2 weeks.

Paid (~$10/year, recommended for trust signal on a religious app):

1. Buy a `.com` / `.org` / `.app` via [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) (sells at wholesale cost, no markup).
2. Dashboard → Your Pages project → **Custom domains** → **Set up a custom domain** → enter the domain.
3. Cloudflare auto-configures DNS + TLS.

---

## Rollback

### Quick rollback via dashboard (< 30 sec)

1. Cloudflare dashboard → Project → **Deployments**.
2. Find the last known-good deployment.
3. Click the 3-dot menu → **Rollback to this deployment**.

Traffic switches immediately. Previous builds are retained for 6 months on the free tier.

### Rollback via git + redeploy

```bash
git revert HEAD           # creates a revert commit
git push origin main      # triggers new deploy
# OR manually:
npm run build && npx wrangler pages deploy dist --project-name=quran-reader-ar --branch=main
```

---

## Troubleshooting

See [`RUNBOOK.md`](RUNBOOK.md) for:
- Sync error debugging
- Token rotation
- Supabase schema migrations
- Service worker cache issues
- Rate limit handling
