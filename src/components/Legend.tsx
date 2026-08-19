import { RISK_COLORS, RISK_LABELS, RISK_ORDER } from "@/lib/riskColors";

interface Props {
  title?: string;
}

export default function Legend({ title = "Flood Risk" }: Props) {
  return (
    <div className="pointer-events-none absolute bottom-6 left-4 rounded-lg bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <ul className="flex flex-col gap-1.5">
        {RISK_ORDER.map((level) => (
          <li key={level} className="flex items-center gap-2 text-xs text-slate-700">
            <span
              className="h-3 w-3 rounded-sm border border-black/10"
              style={{ backgroundColor: RISK_COLORS[level] }}
            />
            {RISK_LABELS[level]}
          </li>
        ))}
      </ul>
    </div>
  );
}
