/**
 * Curated list of well-known supplications (duaa) from the Quran.
 * All references are from the standard 6236-ayah mushaf.
 *
 * Sources: widely-cited classical duaa collections (Hisn al-Muslim,
 * Riyad as-Salihin, Ad-Dua min al-Quran wal-Sunnah). Kept to duaa that
 * are unambiguously present in the verse text — no interpretive
 * categorization of narrative ayahs.
 */
export interface DuaaRef {
  s: number; // surah number (1-114)
  a: number; // ayah number within surah (1-based)
}
export interface Duaa {
  title: string;
  context?: string;
  ayahs: DuaaRef[];
}

export const DUAAS: Duaa[] = [
  {
    title: 'سؤال السداد في الدنيا والآخرة',
    context: 'من أجمع دعاء ورد في القرآن',
    ayahs: [{ s: 2, a: 201 }],
  },
  {
    title: 'خاتمة سورة البقرة',
    context: 'دعاء شامل بالمغفرة والرحمة وتثبيت القدم',
    ayahs: [{ s: 2, a: 285 }, { s: 2, a: 286 }],
  },
  {
    title: 'دعاء تثبيت القلب على الإيمان',
    ayahs: [{ s: 3, a: 8 }],
  },
  {
    title: 'دعاء الإيمان والمغفرة',
    ayahs: [{ s: 3, a: 16 }],
  },
  {
    title: 'دعاء ولي الأمر بالذرية الصالحة',
    context: 'من دعاء زكريا عليه السلام',
    ayahs: [{ s: 3, a: 38 }],
  },
  {
    title: 'دعاء أولي الألباب',
    context: 'من أعظم الدعاء في القرآن، خاتمة آل عمران',
    ayahs: [{ s: 3, a: 191 }, { s: 3, a: 192 }, { s: 3, a: 193 }, { s: 3, a: 194 }],
  },
  {
    title: 'دعاء الاعتراف بالذنب',
    context: 'دعاء آدم عليه السلام',
    ayahs: [{ s: 7, a: 23 }],
  },
  {
    title: 'دعاء الصبر وحسن الخاتمة',
    ayahs: [{ s: 7, a: 126 }],
  },
  {
    title: 'دعاء التوكل على الله',
    context: 'دعاء موسى وقومه',
    ayahs: [{ s: 10, a: 85 }, { s: 10, a: 86 }],
  },
  {
    title: 'دعاء إقامة الصلاة والذرية',
    context: 'من دعاء إبراهيم عليه السلام',
    ayahs: [{ s: 14, a: 40 }, { s: 14, a: 41 }],
  },
  {
    title: 'دعاء الرحمة بالوالدين',
    ayahs: [{ s: 17, a: 24 }],
  },
  {
    title: 'دعاء صدق المدخل والمخرج',
    ayahs: [{ s: 17, a: 80 }],
  },
  {
    title: 'دعاء طلب الرحمة والرشاد',
    context: 'دعاء أصحاب الكهف',
    ayahs: [{ s: 18, a: 10 }],
  },
  {
    title: 'دعاء شرح الصدر وتيسير الأمر',
    context: 'من دعاء موسى عليه السلام عند لقاء فرعون',
    ayahs: [{ s: 20, a: 25 }, { s: 20, a: 26 }, { s: 20, a: 27 }, { s: 20, a: 28 }],
  },
  {
    title: 'دعاء الاستزادة من العلم',
    ayahs: [{ s: 20, a: 114 }],
  },
  {
    title: 'دعاء الكرب والفرج',
    context: 'دعاء يونس عليه السلام في بطن الحوت',
    ayahs: [{ s: 21, a: 87 }],
  },
  {
    title: 'دعاء الذرية الصالحة',
    context: 'دعاء زكريا عليه السلام',
    ayahs: [{ s: 21, a: 89 }],
  },
  {
    title: 'دعاء كشف الضر',
    context: 'دعاء أيوب عليه السلام',
    ayahs: [{ s: 21, a: 83 }],
  },
  {
    title: 'دعاء المنزل المبارك',
    ayahs: [{ s: 23, a: 29 }],
  },
  {
    title: 'دعاء الإيمان والمغفرة',
    ayahs: [{ s: 23, a: 109 }],
  },
  {
    title: 'دعاء الاستعاذة من الشيطان',
    ayahs: [{ s: 23, a: 97 }, { s: 23, a: 98 }],
  },
  {
    title: 'دعاء النجاة من عذاب جهنم',
    ayahs: [{ s: 25, a: 65 }, { s: 25, a: 66 }],
  },
  {
    title: 'دعاء الأزواج والذرية',
    context: 'دعاء عباد الرحمن',
    ayahs: [{ s: 25, a: 74 }],
  },
  {
    title: 'دعاء شكر النعمة والعمل الصالح',
    context: 'من دعاء سليمان عليه السلام',
    ayahs: [{ s: 27, a: 19 }],
  },
  {
    title: 'دعاء الفقر إلى الله',
    context: 'دعاء موسى عليه السلام بعد أن سقى للمرأتين',
    ayahs: [{ s: 28, a: 24 }],
  },
  {
    title: 'دعاء الملائكة للمؤمنين',
    ayahs: [{ s: 40, a: 7 }, { s: 40, a: 8 }, { s: 40, a: 9 }],
  },
  {
    title: 'دعاء الوالدين والذرية',
    ayahs: [{ s: 46, a: 15 }],
  },
  {
    title: 'دعاء المغفرة للإخوة في الإيمان',
    ayahs: [{ s: 59, a: 10 }],
  },
  {
    title: 'دعاء إتمام النور والمغفرة',
    ayahs: [{ s: 66, a: 8 }],
  },
  {
    title: 'دعاء الوالدين والمؤمنين',
    context: 'دعاء نوح عليه السلام',
    ayahs: [{ s: 71, a: 28 }],
  },
];
