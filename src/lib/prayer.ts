/**
 * Prayer / Qibla / Hijri helpers. Pure functions — no adhan import here
 * (adhan is heavier and used only in client-side scripts that need it,
 * where Vite bundles it into the client chunk).
 */

export const MECCA_LAT = 21.4225;
export const MECCA_LON = 39.8262;

/**
 * Great-circle bearing from (lat, lon) to the Kaaba in Mecca.
 * Returns degrees clockwise from true North, in [0, 360).
 */
export function qiblaBearing(lat: number, lon: number): number {
  const φ1 = (lat * Math.PI) / 180;
  const φ2 = (MECCA_LAT * Math.PI) / 180;
  const Δλ = ((MECCA_LON - lon) * Math.PI) / 180;
  const y = Math.sin(Δλ);
  const x = Math.cos(φ1) * Math.tan(φ2) - Math.sin(φ1) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

/**
 * Hijri date via built-in ICU calendar. Works in all modern browsers.
 * Returns the Arabic-formatted date (e.g., "١٥ رمضان ١٤٤٧ هـ").
 */
export function hijriDateArabic(d: Date = new Date()): string {
  try {
    const fmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return fmt.format(d);
  } catch {
    return '';
  }
}

export function hijriDateLatin(d: Date = new Date()): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return fmt.format(d);
  } catch {
    return '';
  }
}

export interface PrayerLabelMap {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export const PRAYER_LABELS_AR: PrayerLabelMap = {
  fajr: 'الفجر',
  sunrise: 'الشروق',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
};

export type CalcMethodKey =
  | 'MuslimWorldLeague'
  | 'Egyptian'
  | 'UmmAlQura'
  | 'Karachi'
  | 'Qatar'
  | 'Kuwait'
  | 'Dubai'
  | 'MoonsightingCommittee'
  | 'Singapore'
  | 'Tehran'
  | 'Turkey'
  | 'NorthAmerica';

export const CALC_METHODS: { key: CalcMethodKey; nameAr: string }[] = [
  { key: 'MuslimWorldLeague', nameAr: 'رابطة العالم الإسلامي' },
  { key: 'Egyptian', nameAr: 'الهيئة المصرية العامة للمساحة' },
  { key: 'UmmAlQura', nameAr: 'أم القرى (السعودية)' },
  { key: 'Karachi', nameAr: 'كراتشي' },
  { key: 'Qatar', nameAr: 'قطر' },
  { key: 'Kuwait', nameAr: 'الكويت' },
  { key: 'Dubai', nameAr: 'دبي' },
  { key: 'MoonsightingCommittee', nameAr: 'لجنة رؤية الهلال' },
  { key: 'Singapore', nameAr: 'سنغافورة' },
  { key: 'Tehran', nameAr: 'طهران' },
  { key: 'Turkey', nameAr: 'ديانت — تركيا' },
  { key: 'NorthAmerica', nameAr: 'أمريكا الشمالية (ISNA)' },
];

export type MadhabKey = 'Shafi' | 'Hanafi';

export function formatTime24(d: Date): string {
  // 24-hour HH:MM, Arabic numerals via fmt
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}
