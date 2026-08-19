// Malaysia's core official/major languages, plus the languages of its
// closest neighbors (land or short maritime border): Thailand, Indonesia,
// Brunei/Singapore (already Malay/English/Chinese/Tamil), and the
// Philippines (Sabah-adjacent). UI chrome only — dataset content (flood
// zone notes, road names) stays in English/Malay as sourced; see DATA.md.
export const LOCALES = ["ms", "en", "zh", "ta", "id", "th", "fil"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ms";

export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  ms: "Bahasa Malaysia",
  en: "English",
  zh: "中文",
  ta: "தமிழ்",
  id: "Bahasa Indonesia",
  th: "ไทย",
  fil: "Filipino",
};

export const LOCALE_STORAGE_KEY = "floodflow-locale";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
