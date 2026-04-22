# Quran Reader (Arabic)

> Fast, free, ad-free Arabic Quran reader. Static-generated, privacy-first, works offline.

**Live:** [quran-reader-ar.pages.dev](https://quran-reader-ar.pages.dev)

---

## What's in it

- **Full Quran** — all 114 surahs, Uthmani script (`quran-uthmani` edition), Tafsir Al-Muyassar for every ayah.
- **Mushaf page view** — 604 pages, faithful Madinah layout, keyboard navigation (←/→), with basmala + inline surah headers.
- **Audio** — per-ayah MP3 from 11 reciters (Alafasy, Abdul Basit, Sudais, Hudhaify, Muaiqly, Minshawi, Husary, etc).
- **Prayer times + Qibla + Hijri** — 100% client-side via [Adhan-js](https://github.com/batoulapps/adhan). 50+ pre-loaded cities, DeviceOrientation compass on phones.
- **Search** — full-text across all 6,236 ayahs, handles tashkeel/hamza normalization, highlights matches.
- **Bookmarks + last-read** — per-ayah, with IntersectionObserver-based auto-tracking.
- **PWA** — installs to home screen, works offline after first visit.
- **Opt-in cross-device sync** — Supabase magic-link auth. Default experience is still local-only; account is optional.
- **Reading settings** — font size, line height, dark/night theme. Applied via CSS variables, persisted locally, synced if signed in.
- **Content integrity** — SHA-256 hash of every data file published at [`/quran-hash.txt`](https://quran-reader-ar.pages.dev/quran-hash.txt) so users can verify text hasn't been tampered with.
- **Arabic-first** — UI, content, and accessibility labels all Arabic. RTL throughout.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Build | Astro 6 SSG | All 758 pages pre-rendered at build time; zero server runtime |
| Styling | Tailwind CSS v4 (via `@tailwindcss/vite`) | Atomic, no bundle bloat |
| Hosting | Cloudflare Pages | Free, unlimited bandwidth, global CDN |
| Auth + sync | Supabase (opt-in) | Free tier, no credit card; email magic link only |
| Logging | Axiom (opt-in) | Free, 500MB/mo, 30-day retention; ingest-only tokens safe in browser |
| PWA | Native Service Worker | Custom cache strategy (network-first HTML, cache-first assets) |
| Fonts | Amiri Quran (data-CDN) + Noto Sans Arabic | Authentic Uthmani script + readable UI |
| Data | `alquran.cloud` API (build-time only) | No runtime API calls; cached as JSON |

**Zero runtime dependencies on paid services.** Total ongoing cost: **$0/month**.

## Quick start (local dev)

```bash
git clone https://github.com/ahmdattia2022/quran-reader-ar.git
cd quran-reader-ar
npm install

# Optional: copy env template and fill in if you want auth + logs locally
cp .env.example .env

# Fetches quran.json + tafsir.json from alquran.cloud (only needed once)
npm run fetch:quran

# Start dev server (http://localhost:4321)
npm run dev
```

The site works without any env vars set — auth/sync and remote logging simply stay off.

## Environment variables

All are optional. Blanks = feature disabled gracefully.

| Variable | Purpose | Required? |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | Supabase project URL | Only if you want cross-device sync |
| `PUBLIC_SUPABASE_ANON_KEY` | Supabase client-side public key (RLS-protected) | Only if you want cross-device sync |
| `PUBLIC_AXIOM_DATASET` | Dataset name for remote logs | Only for production monitoring |
| `PUBLIC_AXIOM_TOKEN` | Ingest-only Axiom token (safe to expose) | Only for production monitoring |
| `PUBLIC_APP_VERSION` | Version tag shown in logs | Optional (defaults to `dev`) |

Full setup of each service: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## npm scripts

```bash
npm run dev             # local dev server on :4321
npm run build           # production build (also runs icons, search index, hash)
npm run preview         # serve the built /dist locally
npm run fetch:quran     # pull Quran text + tafsir from alquran.cloud
npm run hash:quran      # recompute SHA-256 of data files
npm run icons:pwa       # regenerate PWA icons from favicon.svg
npm run ping:indexnow   # ping Bing/Yandex after deploy
```

## Project layout

```
.
├── public/                     # Static assets served at root
│   ├── _headers                # Cloudflare edge cache + security policy
│   ├── manifest.webmanifest    # PWA install manifest
│   ├── sw.js                   # Service worker (custom, not workbox)
│   ├── search-index.json       # Flat searchable Quran text (~780KB)
│   ├── quran-hash.txt          # Content integrity hashes
│   └── icon-*.png              # PWA icons
│
├── src/
│   ├── pages/                  # Astro file-based routes
│   │   ├── index.astro         # Home — surah list, search, prayer strip
│   │   ├── surah/[number].astro # Dynamic surah page (1–114)
│   │   ├── mushaf/             # Mushaf page index + [page].astro
│   │   ├── juz/                # Juz list + [juz].astro
│   │   ├── awqat.astro         # Prayer times + qibla + hijri
│   │   ├── search.astro        # Full-text search UI
│   │   ├── bookmarks.astro     # Saved bookmarks
│   │   ├── about.astro         # About + integrity hash table
│   │   ├── privacy.astro       # Privacy policy (opt-in sync disclosures)
│   │   ├── 404.astro
│   │   └── auth/callback.astro # Magic-link redirect handler
│   │
│   ├── components/             # Reusable Astro components
│   │   ├── ReadingSettings.astro
│   │   ├── MushafPageView.astro
│   │   ├── PrayerStrip.astro
│   │   ├── PWAInstaller.astro
│   │   ├── AuthModal.astro
│   │   └── SyncBadge.astro
│   │
│   ├── layouts/
│   │   └── BaseLayout.astro    # Shared <head>, nav, footer
│   │
│   ├── lib/                    # Pure TS helpers (no DOM deps)
│   │   ├── quran.ts            # Surah/ayah types + audio URL builder
│   │   ├── mushaf.ts           # Build-time page index
│   │   ├── juz.ts              # Build-time juz index
│   │   ├── prayer.ts           # Qibla bearing + Hijri formatter
│   │   ├── cities.ts           # Pre-loaded city list for awqat picker
│   │   ├── supabase.ts         # Supabase client singleton (null-safe)
│   │   ├── sync.ts             # Local-first sync engine (LWW + bookmark union)
│   │   └── logger.ts           # Structured logger (local + Axiom sinks)
│   │
│   ├── data/                   # Committed JSON (from alquran.cloud)
│   │   ├── index.json          # Surah index (24 KB)
│   │   └── quran.json          # Full text + tafsir (~4.3 MB)
│   │
│   └── styles/
│       └── global.css
│
├── scripts/                    # Build-time node scripts
│   ├── fetch-quran.mjs         # Fetch quran data from alquran.cloud
│   ├── compute-hash.mjs        # SHA-256 of data files → quran-hash.txt
│   ├── gen-pwa-icons.mjs       # Generate PWA icons from favicon.svg
│   ├── build-search-index.mjs  # Emit public/search-index.json
│   ├── migrate.mjs             # Run Supabase SQL migrations via pg
│   ├── find-region.mjs         # Auto-detect Supabase pooler region
│   └── ping-indexnow.mjs       # Notify Bing/Yandex after deploy
│
├── supabase/
│   └── schema.sql              # DB schema + RLS + triggers (idempotent)
│
├── docs/
│   ├── ARCHITECTURE.md         # System design + data flow
│   ├── DEPLOYMENT.md           # Full setup guide
│   └── RUNBOOK.md              # Ops tasks
│
├── astro.config.mjs
├── package.json
├── .env.example
└── README.md
```

## Branching model

- **`main`** → production. Pushes auto-deploy (when Cloudflare is Git-connected) or via `wrangler pages deploy` fallback.
- **`preview`** → staging. Cloudflare creates a preview URL at `preview.quran-reader-ar.pages.dev`.
- Feature branches → PR into `preview` → merge to `main` for release.

Full details: [`docs/DEPLOYMENT.md#branching`](docs/DEPLOYMENT.md#branching).

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how data flows, what runs where, why static-first.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — full Cloudflare + Supabase + Axiom setup, branching, env var management.
- [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — operational tasks (rotate tokens, run migrations, debug sync, monitor costs).

## Privacy model

- **No analytics, no cookies, no ads, no tracking.** See [`/privacy`](https://quran-reader-ar.pages.dev/privacy/).
- Default: 100% local (localStorage only, nothing leaves your browser).
- Optional: opt-in Supabase account for cross-device sync — only email is stored.
- Optional: Axiom remote logs — PII-redacted, 30-day retention, user IDs stripped.

## License

Code: MIT — do what you want, attribution appreciated.
Quran text + tafsir: publicly available from [alquran.cloud](https://alquran.cloud). Verify integrity at [`/quran-hash.txt`](https://quran-reader-ar.pages.dev/quran-hash.txt).

---

Made with care. نسأل الله أن ينفع به.
