"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { LiveRiskResponse } from "@/lib/types";

interface Props {
  data: LiveRiskResponse | null;
  error: string | null;
  loading: boolean;
  onRefresh: () => void;
}

/**
 * Live conditions card. Deliberately loud about staleness: when the
 * upstream free tier is unreachable the panel says so and shows the
 * static-fallback state rather than rendering zeros, which would read as
 * "no rain anywhere" — the opposite of the truth.
 */
export default function LiveConditionsPanel({ data, error, loading, onRefresh }: Props) {
  const { t } = useLanguage();

  const live = data != null && data.successfulSamples > 0;
  const generated = data ? new Date(data.generatedAt) : null;

  return (
    <div className="w-64 rounded-lg bg-white/95 px-4 py-3 text-sm shadow-lg backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("live.title")}
        </p>
        <button
          onClick={onRefresh}
          disabled={loading}
          aria-label={t("live.refresh")}
          title={t("live.refresh")}
          className="rounded px-1.5 text-base leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
        >
          ↻
        </button>
      </div>

      {loading && !data && (
        <p className="mt-2 text-slate-500">{t("live.loading")}</p>
      )}

      {error && !data && (
        <p className="mt-2 text-amber-700">{t("live.error")}</p>
      )}

      {data && !live && (
        <div className="mt-2">
          <p className="text-amber-700">{t("live.offline")}</p>
          <p className="mt-1 text-xs text-slate-500">{t("live.offlineDetail")}</p>
        </div>
      )}

      {data && live && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-slate-600">{t("live.rain24h")}</span>
            <span className="font-semibold text-slate-900">
              {data.summary.meanTotalMm.toFixed(1)} mm
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-slate-600">{t("live.peak")}</span>
            <span className="font-semibold text-slate-900">
              {data.summary.maxTotalMm.toFixed(1)} mm
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-slate-600">{t("live.wetZones")}</span>
            <span className="font-semibold text-slate-900">
              {data.summary.wetZones} / {data.zones.length}
            </span>
          </div>
          {data.summary.meanAqi > 0 && (
            <div className="flex items-baseline justify-between">
              <span className="text-slate-600">{t("live.aqi")}</span>
              <span className="font-semibold text-slate-900">{data.summary.meanAqi}</span>
            </div>
          )}
          <div className="mt-0.5 flex items-center gap-1.5 border-t border-slate-200 pt-2 text-xs text-slate-500">
            <span
              className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"
              aria-hidden
            />
            <span>{t("live.source")}</span>
            {generated && (
              <span className="ml-auto tabular-nums">
                {generated.toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
