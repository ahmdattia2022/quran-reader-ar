#!/usr/bin/env node
/**
 * Emits one compact JSON per surah at public/surah-data/<n>.json so
 * client-side pagination can lazy-load ayahs beyond the initial batch
 * without bloating the surah HTML (Al-Baqarah has 286 ayahs — inlining
 * them all pushes the page over 1 MB).
 *
 * The surah page pre-renders the first 30 ayahs as real HTML for LCP
 * + no-JS fallback + SEO; the rest come from this JSON when the user
 * taps "load more".
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function main() {
  const quran = JSON.parse(await readFile(join(ROOT, 'src', 'data', 'quran.json'), 'utf8'));
  const outDir = join(ROOT, 'public', 'surah-data');
  await mkdir(outDir, { recursive: true });

  let totalBytes = 0;
  for (const s of quran) {
    const payload = {
      n: s.number,
      ayahs: s.ayahs.map((a) => ({
        n: a.numberInSurah,
        g: a.numberInQuran,
        t: a.text,
        tf: a.tafsir || '',
        j: a.juz,
        p: a.page,
      })),
    };
    const json = JSON.stringify(payload);
    totalBytes += json.length;
    await writeFile(join(outDir, `${s.number}.json`), json, 'utf8');
  }
  console.log(`  wrote public/surah-data/*.json — ${quran.length} files, ${(totalBytes / 1024).toFixed(1)} KB total`);
}
main().catch((err) => { console.error('FAILED:', err); process.exit(1); });
