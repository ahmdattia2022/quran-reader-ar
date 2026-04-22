#!/usr/bin/env node
/**
 * Emits public/daily-ayahs.json — a deterministic 400-day rotation of
 * ayahs used by the "Ayah of the Day" home-page widget.
 *
 * Client picks today's entry by (Date.now() / 86400000) mod 400, so every
 * visitor on a given UTC day sees the same ayah.
 *
 * Stepping through the 6,236 ayahs by a prime (1009) coprime with the
 * total guarantees every daily pick lands on a different ayah across a
 * 400-day window.
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
    const shortName = s.name.replace(/^سُورَةُ\s*/, '').replace(/^سورة\s*/, '');
    for (const a of s.ayahs) {
      flat.push({
        n: a.numberInQuran,
        s: s.number,
        a: a.numberInSurah,
        sn: shortName,
        t: a.text,
        tf: a.tafsir || '',
      });
    }
  }

  if (flat.length !== 6236) {
    console.warn(`  WARN: expected 6236 ayahs, got ${flat.length}`);
  }

  const total = flat.length;
  const step = 1009; // prime, coprime with 6236
  const days = 400;

  const daily = [];
  for (let d = 0; d < days; d++) {
    const idx = (d * step) % total;
    daily.push({ d, ...flat[idx] });
  }

  const json = JSON.stringify(daily);
  await writeFile(join(ROOT, 'public', 'daily-ayahs.json'), json, 'utf8');
  console.log(`  wrote public/daily-ayahs.json — ${days} days, ${json.length} bytes`);
}

main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
