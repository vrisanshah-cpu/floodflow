import type { RiskLevel } from "./types";

// Shared color scale used by both the map layer paint expression and the
// legend, so they can never visually drift apart.
export const RISK_COLORS: Record<RiskLevel, string> = {
  low: "#22c55e",
  medium: "#eab308",
  high: "#f97316",
  extreme: "#dc2626",
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  extreme: "Extreme",
};

export const RISK_ORDER: RiskLevel[] = ["low", "medium", "high", "extreme"];

// Midpoint numeric value for each bucket, used when a feature has no
// explicit risk_score. Keeps the compounding-risk math well-defined even
// for hand-classified placeholder/manual data.
export const RISK_LEVEL_MIDPOINT: Record<RiskLevel, number> = {
  low: 0.15,
  medium: 0.4,
  high: 0.7,
  extreme: 0.9,
};

/** Mapbox GL "match" expression: risk_level -> color. */
/** Buckets a continuous 0–1 compounding risk score into the same levels
 * used for hand-classified flood data, so one legend/color scale serves
 * both layers. */
export function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 0.75) return "extreme";
  if (score >= 0.5) return "high";
  if (score >= 0.25) return "medium";
  return "low";
}

export const floodFillColorExpression = [
  "match",
  ["get", "risk_level"],
  "low",
  RISK_COLORS.low,
  "medium",
  RISK_COLORS.medium,
  "high",
  RISK_COLORS.high,
  "extreme",
  RISK_COLORS.extreme,
  /* default */ "#9ca3af",
];
