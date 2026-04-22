#!/usr/bin/env node
/**
 * Fetches optional (non-default) tafsir editions from alquran.cloud and
 * emits one flat file per edition at public/tafsirs/<id>.json.
 *
 * The main Al-Muyassar tafsir is still baked into src/data/quran.json
 * (via scripts/fetch-quran.mjs) so initial reading works with zero extra
 * network requests. These extended tafsirs are fetched on demand when
 * the user switches tabs on a surah page.
 *
 * Shape: { edition, name, texts: string[] }  — texts[i] is the tafsir
 * for the ayah whose numberInQuran === i + 1.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'tafsirs');

// Keep this list small — each entry is a separate ~1-5 MB file served
// from the CDN. Users only fetch one when they open the tab.
const EDITIONS = [
  { id: 'ar.jalalayn', shortName: 'الجلالين' },
  { id: 'ar.baghawi', shortName: 'البغوي' },
];

async function fetchEdition(id) {
  const url = `https://api.alquran.cloud/v1/quran/${id}`;
  console.log(`  → GET ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} on ${url}`);
  const json = await res.json();
  if (json.code !== 200) throw new Error(`API code ${json.code}: ${json.status}`);
  return json.data;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const { id, shortName } of EDITIONS) {
    console.log(`\n${id} (${shortName})`);
    const data = await fetchEdition(id);

    // Build dense array keyed by (numberInQuran - 1) so the client can do
    // an O(1) lookup.
    const texts = new Array(6236).fill('');
    for (const s of data.surahs) {
      for (const a of s.ayahs) {
        const idx = a.number - 1;
        if (idx >= 0 && idx < texts.length) texts[idx] = a.text || '';
      }
    }

    const payload = { edition: id, name: shortName, texts };
    const json = JSON.stringify(payload);
    const safeId = id.replace(/[^a-z0-9_.-]/gi, '_');
    await writeFile(join(OUT_DIR, `${safeId}.json`), json, 'utf8');
    console.log(`  wrote public/tafsirs/${safeId}.json — ${(json.length / 1024).toFixed(1)} KB`);
  }
}

main().catch((err) => { console.error('\nFAILED:', err.message); process.exit(1); });
