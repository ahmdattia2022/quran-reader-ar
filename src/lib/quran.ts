import indexData from '../data/index.json';
import quranData from '../data/quran.json';

export interface SurahMeta {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  revelationType: 'Meccan' | 'Medinan';
  numberOfAyahs: number;
}

export interface Ayah {
  numberInSurah: number;
  numberInQuran: number;
  text: string;
  juz: number;
  page: number;
  tafsir: string;
}

export interface Surah extends SurahMeta {
  ayahs: Ayah[];
}

export const surahIndex: SurahMeta[] = indexData as SurahMeta[];
export const allSurahs: Surah[] = quranData as Surah[];

export function getSurah(number: number): Surah | undefined {
  return allSurahs.find((s) => s.number === number);
}

// Audio CDN (alquran.cloud / islamic.network) — per-ayah MP3
// Reciters identified by bitrate + slug
export const RECITERS = [
  { id: 'ar.alafasy', name: 'مشاري راشد العفاسي', bitrate: 128 },
  { id: 'ar.abdulbasitmurattal', name: 'عبد الباسط عبد الصمد', bitrate: 192 },
  { id: 'ar.abdurrahmaansudais', name: 'عبد الرحمن السديس', bitrate: 192 },
  { id: 'ar.saoodshuraym', name: 'سعود الشريم', bitrate: 64 },
  { id: 'ar.mahermuaiqly', name: 'ماهر المعيقلي', bitrate: 128 },
  { id: 'ar.minshawi', name: 'محمد صديق المنشاوي', bitrate: 128 },
  { id: 'ar.husary', name: 'محمود خليل الحصري', bitrate: 128 },
  { id: 'ar.hudhaify', name: 'علي بن عبد الرحمن الحذيفي', bitrate: 128 },
  { id: 'ar.ibrahimakhbar', name: 'إبراهيم الأخضر', bitrate: 32 },
  { id: 'ar.muhammadayyoub', name: 'محمد أيوب', bitrate: 128 },
  { id: 'ar.muhammadjibreel', name: 'محمد جبريل', bitrate: 128 },
] as const;

export const DEFAULT_RECITER = 'ar.alafasy';

export function audioUrl(numberInQuran: number, reciterId: string = DEFAULT_RECITER): string {
  const reciter = RECITERS.find((r) => r.id === reciterId) ?? RECITERS[0];
  return `https://cdn.islamic.network/quran/audio/${reciter.bitrate}/${reciter.id}/${numberInQuran}.mp3`;
}

// Convert integer to Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩)
export function arabicDigits(n: number | string): string {
  const map = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(n).replace(/[0-9]/g, (d) => map[Number(d)]);
}

export function revelationTypeAr(type: SurahMeta['revelationType']): string {
  return type === 'Meccan' ? 'مكية' : 'مدنية';
}

// Convert surah name (from API, e.g. "سُورَةُ ٱلْفَاتِحَةِ") to a short display name
export function shortSurahName(name: string): string {
  return name.replace(/^سُورَةُ\s*/, '').replace(/^سورة\s*/, '');
}
