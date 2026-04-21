# Quran Reader (Arabic)

Fast, free, ad-free Quran reader with Uthmani script, Tafsir Al-Muyassar, and recitation audio from 11 reciters. Built as a static site for maximum speed and SEO.

## Stack

- **Astro 6** — static site generation (all 114 surahs pre-rendered as HTML at build time)
- **Tailwind CSS 4** — styling
- **Amiri Quran** font — authentic Uthmani script
- **alquran.cloud API** — Quran text + tafsir (fetched once at build time, cached as JSON)
- **cdn.islamic.network** — audio CDN (per-ayah MP3, 11 reciters)
- **Cloudflare Pages** — hosting (free, unlimited bandwidth)

## Scripts

```bash
npm install           # install deps
npm run fetch:quran   # fetch Quran + tafsir data (run once)
npm run dev           # local dev server
npm run build         # production build
npm run preview       # preview production build
```

## Deployment

Pushes to `main` auto-deploy to Cloudflare Pages.

## Data

- `src/data/index.json` — surah list (metadata only)
- `src/data/quran.json` — full Quran text + tafsir (~4MB, committed to repo)

Data is Uthmani script (`quran-uthmani` edition) + Tafsir Al-Muyassar (`ar.muyassar`). Both from alquran.cloud, publicly available.
