"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { LOCALES, LOCALE_NATIVE_NAMES } from "@/lib/i18n/locales";

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useLanguage();

  return (
    <label className="flex items-center gap-2 text-xs text-slate-700">
      <span className="sr-only">{t("language.label")}</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as typeof locale)}
        className="cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm"
        aria-label={t("language.label")}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_NATIVE_NAMES[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
