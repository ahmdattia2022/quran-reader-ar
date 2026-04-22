/**
 * Juz (part) index — the Quran is divided into 30 approximately-equal
 * juz for sequential reading over a month. Built at build time from
 * src/data/quran.json via the `juz` field attached to every ayah.
 */
import { allSurahs, type Ayah } from './quran.ts';

export const JUZ_TOTAL = 30;

export interface JuzBoundary {
  juz: number;
  startSurah: number;
  startAyah: number;
  startSurahName: string;
  startSurahEnglishName: string;
  endSurah: number;
  endAyah: number;
  endSurahName: string;
  endSurahEnglishName: string;
  ayahCount: number;
  startPage: number;
  endPage: number;
}

function buildIndex(): JuzBoundary[] {
  // Flatten all ayahs with their owning surah's names for quick lookup.
  const flat: Array<Ayah & { surahNumber: number; surahName: string; surahEnglishName: string }> = [];
  for (const surah of allSurahs) {
    for (const ayah of surah.ayahs) {
      flat.push({
        ...ayah,
        surahNumber: surah.number,
        surahName: surah.name,
        surahEnglishName: surah.englishName,
      });
    }
  }

  const byJuz = new Map<number, typeof flat>();
  for (const a of flat) {
    if (!byJuz.has(a.juz)) byJuz.set(a.juz, []);
    byJuz.get(a.juz)!.push(a);
  }

  const boundaries: JuzBoundary[] = [];
  for (let juz = 1; juz <= JUZ_TOTAL; juz++) {
    const list = byJuz.get(juz);
    if (!list || list.length === 0) continue;
    const first = list[0];
    const last = list[list.length - 1];
    boundaries.push({
      juz,
      startSurah: first.surahNumber,
      startAyah: first.numberInSurah,
      startSurahName: first.surahName,
      startSurahEnglishName: first.surahEnglishName,
      endSurah: last.surahNumber,
      endAyah: last.numberInSurah,
      endSurahName: last.surahName,
      endSurahEnglishName: last.surahEnglishName,
      ayahCount: list.length,
      startPage: Math.min(...list.map((a) => a.page)),
      endPage: Math.max(...list.map((a) => a.page)),
    });
  }
  return boundaries;
}

export const juzBoundaries: JuzBoundary[] = buildIndex();

export function getJuzBoundary(juz: number): JuzBoundary | undefined {
  return juzBoundaries.find((b) => b.juz === juz);
}

/** All ayahs that belong to a specific juz, preserving surah order. */
export function getJuzAyahs(juz: number): Array<{
  surahNumber: number;
  surahName: string;
  surahEnglishName: string;
  ayahs: Ayah[];
}> {
  const out: Array<{ surahNumber: number; surahName: string; surahEnglishName: string; ayahs: Ayah[] }> = [];
  for (const surah of allSurahs) {
    const inJuz = surah.ayahs.filter((a) => a.juz === juz);
    if (inJuz.length > 0) {
      out.push({
        surahNumber: surah.number,
        surahName: surah.name,
        surahEnglishName: surah.englishName,
        ayahs: inJuz,
      });
    }
  }
  return out;
}
