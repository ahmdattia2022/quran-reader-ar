/**
 * Mushaf page index — groups ayahs by their page number (1–604 in the
 * standard Madinah mushaf). Each page can span multiple surahs, so a
 * page is a list of "surah fragments" each containing the consecutive
 * ayahs from that surah that land on this page.
 *
 * Computed at build time from src/data/quran.json. No runtime cost,
 * no extra data files.
 */
import { allSurahs, type Ayah, type Surah } from './quran.ts';

export const MUSHAF_TOTAL_PAGES = 604;

/** A contiguous slice of ayahs from one surah that land on a single mushaf page. */
export interface MushafSurahFragment {
  surahNumber: number;
  surahName: string;
  surahEnglishName: string;
  revelationType: Surah['revelationType'];
  /** True when this fragment starts at ayah 1 of its surah (the page opens a new surah). */
  startsSurah: boolean;
  ayahs: Ayah[];
}

export interface MushafPage {
  pageNumber: number;
  juz: number;
  fragments: MushafSurahFragment[];
}

// Build the page index once per build.
function buildIndex(): MushafPage[] {
  const pages = new Map<number, MushafPage>();
  for (const surah of allSurahs) {
    for (const ayah of surah.ayahs) {
      if (!pages.has(ayah.page)) {
        pages.set(ayah.page, { pageNumber: ayah.page, juz: ayah.juz, fragments: [] });
      }
      const page = pages.get(ayah.page)!;
      let fragment = page.fragments[page.fragments.length - 1];
      if (!fragment || fragment.surahNumber !== surah.number) {
        fragment = {
          surahNumber: surah.number,
          surahName: surah.name,
          surahEnglishName: surah.englishName,
          revelationType: surah.revelationType,
          startsSurah: ayah.numberInSurah === 1,
          ayahs: [],
        };
        page.fragments.push(fragment);
      }
      fragment.ayahs.push(ayah);
    }
  }
  return Array.from(pages.values()).sort((a, b) => a.pageNumber - b.pageNumber);
}

export const mushafPages: MushafPage[] = buildIndex();

export function getMushafPage(pageNumber: number): MushafPage | undefined {
  return mushafPages.find((p) => p.pageNumber === pageNumber);
}

/** Strip diacritics-only basmala prefix that some editions attach to ayah 1 of non-Fatiha surahs. */
const BASMALA_CANDIDATES = [
  'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
  'بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ',
  'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
];
export function stripBasmala(text: string): string {
  for (const marker of BASMALA_CANDIDATES) {
    if (text.startsWith(marker)) return text.slice(marker.length).trim();
  }
  return text;
}
