#!/usr/bin/env node
/**
 * Downloads the entire Quran (Uthmani script) + Tafsir Al-Muyassar
 * from alquran.cloud API and saves to src/data/ as static JSON.
 * Run once with: npm run fetch:quran
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'src', 'data');

const ENDPOINTS = {
  quran: 'https://api.alquran.cloud/v1/quran/quran-uthmani',
  tafsir: 'https://api.alquran.cloud/v1/quran/ar.muyassar',
};

async function fetchJson(url) {
  console.log(`  → GET ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} on ${url}`);
  const json = await res.json();
  if (json.code !== 200) throw new Error(`API code ${json.code}: ${json.status}`);
  return json.data;
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  console.log('Fetching Uthmani Quran text…');
  const quran = await fetchJson(ENDPOINTS.quran);

  console.log('Fetching Tafsir Al-Muyassar…');
  const tafsir = await fetchJson(ENDPOINTS.tafsir);

  const tafsirMap = new Map();
  for (const s of tafsir.surahs) {
    for (const a of s.ayahs) {
      tafsirMap.set(`${s.number}:${a.numberInSurah}`, a.text);
    }
  }

  const surahs = quran.surahs.map((s) => ({
    number: s.number,
    name: s.name,
    englishName: s.englishName,
    englishNameTranslation: s.englishNameTranslation,
    revelationType: s.revelationType,
    numberOfAyahs: s.ayahs.length,
    ayahs: s.ayahs.map((a) => ({
      numberInSurah: a.numberInSurah,
      numberInQuran: a.number,
      text: a.text,
      juz: a.juz,
      page: a.page,
      tafsir: tafsirMap.get(`${s.number}:${a.numberInSurah}`) || '',
    })),
  }));

  const index = surahs.map((s) => ({
    number: s.number,
    name: s.name,
    englishName: s.englishName,
    englishNameTranslation: s.englishNameTranslation,
    revelationType: s.revelationType,
    numberOfAyahs: s.numberOfAyahs,
  }));

  await writeFile(join(DATA_DIR, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
  await writeFile(join(DATA_DIR, 'quran.json'), JSON.stringify(surahs), 'utf8');
  console.log(`\nSaved ${surahs.length} surahs to ${DATA_DIR}`);
  console.log('  index.json — surah list (small, for homepage)');
  console.log('  quran.json — full text + tafsir (large, for surah pages)');
}

main().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
