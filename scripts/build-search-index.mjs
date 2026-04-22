#!/usr/bin/env node
/**
 * Flattens quran.json into a compact search index at
 * public/search-index.json. Each entry is [surahNumber, ayahInSurah, text].
 * Using an array-of-arrays (not object-of-keys) shaves ~100KB by
 * eliminating repeated property names.
 *
 * Client fetches this once, normalizes tashkeel on the fly, and runs
 * substring search across all 6,236 ayahs (~20ms end-to-end).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function main() {
  const quran = JSON.parse(await readFile(join(ROOT, 'src', 'data', 'quran.json'), 'utf8'));
  const flat = [];
  for (const s of quran) {
    for (const a of s.ayahs) {
      flat.push([s.number, a.numberInSurah, a.text]);
    }
  }
  // Also emit a tiny surah-name map for result display
  const index = JSON.parse(await readFile(join(ROOT, 'src', 'data', 'index.json'), 'utf8'));
  const names = {};
  for (const s of index) names[s.number] = s.name.replace(/^سُورَةُ\s*/, '').replace(/^سورة\s*/, '');

  const payload = { ayahs: flat, names };
  const json = JSON.stringify(payload);
  await writeFile(join(ROOT, 'public', 'search-index.json'), json, 'utf8');
  console.log(`  wrote public/search-index.json — ${flat.length} ayahs, ${json.length} bytes`);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
