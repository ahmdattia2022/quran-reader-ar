/**
 * Pre-loaded list of major Arab/Islamic cities for the prayer-times
 * city picker. Users who need a city not in this list can enter
 * coordinates manually. Kept small intentionally — this isn't a
 * gazetteer, it's a convenience for the 80% case.
 */

export interface City {
  nameAr: string;
  nameEn: string;
  country: string;
  lat: number;
  lon: number;
  tz?: string;
}

export const CITIES: City[] = [
  // Egypt
  { nameAr: 'القاهرة', nameEn: 'Cairo', country: 'مصر', lat: 30.0444, lon: 31.2357 },
  { nameAr: 'الإسكندرية', nameEn: 'Alexandria', country: 'مصر', lat: 31.2001, lon: 29.9187 },
  { nameAr: 'الجيزة', nameEn: 'Giza', country: 'مصر', lat: 30.0131, lon: 31.2089 },
  { nameAr: 'المنصورة', nameEn: 'Mansoura', country: 'مصر', lat: 31.0409, lon: 31.3785 },
  { nameAr: 'طنطا', nameEn: 'Tanta', country: 'مصر', lat: 30.7865, lon: 31.0004 },
  { nameAr: 'أسيوط', nameEn: 'Asyut', country: 'مصر', lat: 27.1828, lon: 31.1859 },
  { nameAr: 'الأقصر', nameEn: 'Luxor', country: 'مصر', lat: 25.6872, lon: 32.6396 },
  { nameAr: 'أسوان', nameEn: 'Aswan', country: 'مصر', lat: 24.0889, lon: 32.8998 },

  // Saudi Arabia
  { nameAr: 'مكة المكرمة', nameEn: 'Mecca', country: 'السعودية', lat: 21.4225, lon: 39.8262 },
  { nameAr: 'المدينة المنورة', nameEn: 'Medina', country: 'السعودية', lat: 24.4672, lon: 39.6111 },
  { nameAr: 'الرياض', nameEn: 'Riyadh', country: 'السعودية', lat: 24.7136, lon: 46.6753 },
  { nameAr: 'جدة', nameEn: 'Jeddah', country: 'السعودية', lat: 21.4858, lon: 39.1925 },
  { nameAr: 'الدمام', nameEn: 'Dammam', country: 'السعودية', lat: 26.4207, lon: 50.0888 },
  { nameAr: 'الطائف', nameEn: 'Taif', country: 'السعودية', lat: 21.2703, lon: 40.4158 },

  // UAE
  { nameAr: 'دبي', nameEn: 'Dubai', country: 'الإمارات', lat: 25.2048, lon: 55.2708 },
  { nameAr: 'أبو ظبي', nameEn: 'Abu Dhabi', country: 'الإمارات', lat: 24.4539, lon: 54.3773 },
  { nameAr: 'الشارقة', nameEn: 'Sharjah', country: 'الإمارات', lat: 25.3463, lon: 55.4209 },

  // Kuwait / Qatar / Bahrain / Oman
  { nameAr: 'الكويت', nameEn: 'Kuwait City', country: 'الكويت', lat: 29.3759, lon: 47.9774 },
  { nameAr: 'الدوحة', nameEn: 'Doha', country: 'قطر', lat: 25.2854, lon: 51.5310 },
  { nameAr: 'المنامة', nameEn: 'Manama', country: 'البحرين', lat: 26.2235, lon: 50.5876 },
  { nameAr: 'مسقط', nameEn: 'Muscat', country: 'عُمان', lat: 23.5880, lon: 58.3829 },

  // Levant
  { nameAr: 'القدس', nameEn: 'Jerusalem', country: 'فلسطين', lat: 31.7683, lon: 35.2137 },
  { nameAr: 'غزة', nameEn: 'Gaza', country: 'فلسطين', lat: 31.5017, lon: 34.4668 },
  { nameAr: 'رام الله', nameEn: 'Ramallah', country: 'فلسطين', lat: 31.9073, lon: 35.2044 },
  { nameAr: 'عمّان', nameEn: 'Amman', country: 'الأردن', lat: 31.9454, lon: 35.9284 },
  { nameAr: 'دمشق', nameEn: 'Damascus', country: 'سوريا', lat: 33.5138, lon: 36.2765 },
  { nameAr: 'حلب', nameEn: 'Aleppo', country: 'سوريا', lat: 36.2021, lon: 37.1343 },
  { nameAr: 'بيروت', nameEn: 'Beirut', country: 'لبنان', lat: 33.8938, lon: 35.5018 },
  { nameAr: 'بغداد', nameEn: 'Baghdad', country: 'العراق', lat: 33.3152, lon: 44.3661 },
  { nameAr: 'الموصل', nameEn: 'Mosul', country: 'العراق', lat: 36.3456, lon: 43.1575 },
  { nameAr: 'البصرة', nameEn: 'Basra', country: 'العراق', lat: 30.5085, lon: 47.7804 },

  // North Africa
  { nameAr: 'الدار البيضاء', nameEn: 'Casablanca', country: 'المغرب', lat: 33.5731, lon: -7.5898 },
  { nameAr: 'الرباط', nameEn: 'Rabat', country: 'المغرب', lat: 34.0209, lon: -6.8416 },
  { nameAr: 'مراكش', nameEn: 'Marrakech', country: 'المغرب', lat: 31.6295, lon: -7.9811 },
  { nameAr: 'فاس', nameEn: 'Fes', country: 'المغرب', lat: 34.0181, lon: -5.0078 },
  { nameAr: 'الجزائر', nameEn: 'Algiers', country: 'الجزائر', lat: 36.7538, lon: 3.0588 },
  { nameAr: 'وهران', nameEn: 'Oran', country: 'الجزائر', lat: 35.6971, lon: -0.6337 },
  { nameAr: 'تونس', nameEn: 'Tunis', country: 'تونس', lat: 36.8065, lon: 10.1815 },
  { nameAr: 'صفاقس', nameEn: 'Sfax', country: 'تونس', lat: 34.7406, lon: 10.7603 },
  { nameAr: 'طرابلس', nameEn: 'Tripoli', country: 'ليبيا', lat: 32.8872, lon: 13.1913 },
  { nameAr: 'بنغازي', nameEn: 'Benghazi', country: 'ليبيا', lat: 32.1167, lon: 20.0667 },
  { nameAr: 'الخرطوم', nameEn: 'Khartoum', country: 'السودان', lat: 15.5007, lon: 32.5599 },

  // Yemen
  { nameAr: 'صنعاء', nameEn: "Sana'a", country: 'اليمن', lat: 15.3694, lon: 44.1910 },
  { nameAr: 'عدن', nameEn: 'Aden', country: 'اليمن', lat: 12.7855, lon: 45.0187 },

  // Turkey (large Muslim population)
  { nameAr: 'إسطنبول', nameEn: 'Istanbul', country: 'تركيا', lat: 41.0082, lon: 28.9784 },
  { nameAr: 'أنقرة', nameEn: 'Ankara', country: 'تركيا', lat: 39.9334, lon: 32.8597 },

  // Other major cities with Muslim populations
  { nameAr: 'لندن', nameEn: 'London', country: 'المملكة المتحدة', lat: 51.5074, lon: -0.1278 },
  { nameAr: 'باريس', nameEn: 'Paris', country: 'فرنسا', lat: 48.8566, lon: 2.3522 },
  { nameAr: 'برلين', nameEn: 'Berlin', country: 'ألمانيا', lat: 52.5200, lon: 13.4050 },
  { nameAr: 'نيويورك', nameEn: 'New York', country: 'الولايات المتحدة', lat: 40.7128, lon: -74.0060 },
  { nameAr: 'كوالالمبور', nameEn: 'Kuala Lumpur', country: 'ماليزيا', lat: 3.1390, lon: 101.6869 },
  { nameAr: 'جاكرتا', nameEn: 'Jakarta', country: 'إندونيسيا', lat: -6.2088, lon: 106.8456 },
  { nameAr: 'كراتشي', nameEn: 'Karachi', country: 'باكستان', lat: 24.8607, lon: 67.0011 },
  { nameAr: 'إسلام أباد', nameEn: 'Islamabad', country: 'باكستان', lat: 33.6844, lon: 73.0479 },
  { nameAr: 'لاهور', nameEn: 'Lahore', country: 'باكستان', lat: 31.5204, lon: 74.3587 },
  { nameAr: 'دكا', nameEn: 'Dhaka', country: 'بنغلاديش', lat: 23.8103, lon: 90.4125 },
];
