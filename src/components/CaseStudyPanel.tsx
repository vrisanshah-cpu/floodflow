import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Props {
  zoneName: string;
  notes?: string;
  reduction: number; // 0..1
  onReductionChange: (value: number) => void;
  baselineScore: number | null;
  simulatedScore: number | null;
  onClose: () => void;
}

export default function CaseStudyPanel({
  zoneName,
  notes,
  reduction,
  onReductionChange,
  baselineScore,
  simulatedScore,
  onClose,
}: Props) {
  const { t } = useLanguage();

  return (
    <div className="absolute bottom-6 right-4 z-[1200] w-80 max-w-[calc(100vw-2rem)] rounded-lg bg-white/95 p-4 text-sm shadow-xl backdrop-blur">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("caseStudy.title")}
          </p>
          <p className="text-base font-semibold text-slate-900">{zoneName}</p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
        >
          {t("caseStudy.close")}
        </button>
      </div>

      {notes && (
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("caseStudy.historicalEvent")}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{notes}</p>
        </div>
      )}

      <div className="border-t border-slate-200 pt-3">
        <p className="mb-1 text-xs font-semibold text-slate-700">{t("caseStudy.whatIf")}</p>
        <label className="mb-2 flex items-center gap-2 text-xs text-slate-600">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(reduction * 100)}
            onChange={(e) => onReductionChange(Number(e.target.value) / 100)}
            className="w-full"
          />
          <span className="w-10 shrink-0 text-right tabular-nums">
            {Math.round(reduction * 100)}%
          </span>
        </label>
        <p className="text-xs text-slate-500">{t("caseStudy.reduction")}</p>

        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-md bg-slate-100 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">
              {t("caseStudy.baseline")}
            </p>
            <p className="text-lg font-semibold text-slate-800">
              {baselineScore != null ? baselineScore.toFixed(2) : "—"}
            </p>
          </div>
          <div className="rounded-md bg-emerald-50 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-emerald-700">
              {t("caseStudy.simulated")}
            </p>
            <p className="text-lg font-semibold text-emerald-700">
              {simulatedScore != null ? simulatedScore.toFixed(2) : "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
