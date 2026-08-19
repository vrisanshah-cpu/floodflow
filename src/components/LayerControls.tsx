import type { PrimaryLayer } from "@/lib/types";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Props {
  primaryLayer: PrimaryLayer;
  onPrimaryLayerChange: (layer: PrimaryLayer) => void;
  showParking: boolean;
  onShowParkingChange: (v: boolean) => void;
  showCongestion: boolean;
  onShowCongestionChange: (v: boolean) => void;
}

export default function LayerControls({
  primaryLayer,
  onPrimaryLayerChange,
  showParking,
  onShowParkingChange,
  showCongestion,
  onShowCongestionChange,
}: Props) {
  const { t } = useLanguage();

  return (
    <div className="flex w-56 flex-col gap-3 rounded-lg bg-white/95 px-4 py-3 text-sm shadow-lg backdrop-blur">
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("layer.primaryLayer")}
        </p>
        <div className="flex flex-col gap-1">
          <label className="flex cursor-pointer items-center gap-2 text-slate-700">
            <input
              type="radio"
              name="primary-layer"
              checked={primaryLayer === "compound"}
              onChange={() => onPrimaryLayerChange("compound")}
            />
            {t("layer.compoundingRisk")}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-slate-700">
            <input
              type="radio"
              name="primary-layer"
              checked={primaryLayer === "flood"}
              onChange={() => onPrimaryLayerChange("flood")}
            />
            {t("layer.floodRiskOnly")}
          </label>
        </div>
      </div>

      <div className="border-t border-slate-200 pt-2">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("layer.referenceData")}
        </p>
        <div className="flex flex-col gap-1">
          <label className="flex cursor-pointer items-center gap-2 text-slate-700">
            <input
              type="checkbox"
              checked={showParking}
              onChange={(e) => onShowParkingChange(e.target.checked)}
            />
            {t("layer.parkingLocations")}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-slate-700">
            <input
              type="checkbox"
              checked={showCongestion}
              onChange={(e) => onShowCongestionChange(e.target.checked)}
            />
            {t("layer.congestionSegments")}
          </label>
        </div>
      </div>
    </div>
  );
}
