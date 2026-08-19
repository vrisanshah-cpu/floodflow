import { RISK_COLORS, RISK_ORDER } from "@/lib/riskColors";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";

interface Props {
  titleKey: "legend.floodRisk" | "legend.compoundingRisk";
}

const RISK_LABEL_KEYS: Record<(typeof RISK_ORDER)[number], TranslationKey> = {
  low: "risk.low",
  medium: "risk.medium",
  high: "risk.high",
  extreme: "risk.extreme",
};

export default function Legend({ titleKey }: Props) {
  const { t } = useLanguage();

  return (
    <div className="pointer-events-none absolute bottom-6 left-4 rounded-lg bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {t(titleKey)}
      </p>
      <ul className="flex flex-col gap-1.5">
        {RISK_ORDER.map((level) => (
          <li key={level} className="flex items-center gap-2 text-xs text-slate-700">
            <span
              className="h-3 w-3 rounded-sm border border-black/10"
              style={{ backgroundColor: RISK_COLORS[level] }}
            />
            {t(RISK_LABEL_KEYS[level])}
          </li>
        ))}
      </ul>
    </div>
  );
}
