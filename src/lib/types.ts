// Shared data schema for FloodFlow.
// Real datasets (flood risk, parking, congestion) must conform to these shapes.
// See DATA.md at the project root for the full ingestion spec.

export type RiskLevel = "low" | "medium" | "high" | "extreme";

export interface FloodRiskProperties {
  /** Stable identifier for the flood zone (e.g. "klang-sri-muda"). */
  id: string;
  /** Human-readable name shown in tooltips/case studies. */
  name: string;
  /** Categorical risk bucket — always required, drives the default color scale. */
  risk_level: RiskLevel;
  /**
   * Optional continuous risk score in [0, 1]. If provided, this is used for
   * the compounding-risk calculation instead of the risk_level bucket
   * midpoint, giving finer-grained gradients.
   */
  risk_score?: number;
  /** Optional freeform note, e.g. reference to a historical flood event. */
  notes?: string;
  /** Optional citation for where this polygon's risk classification came from. */
  source?: string;
}

export type FloodRiskFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  FloodRiskProperties
>;

export interface ParkingPointProperties {
  id: string;
  name?: string;
  capacity?: number;
  parking_type?: string;
  source?: string;
}

export type ParkingFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  ParkingPointProperties
>;

export interface CongestionSegment {
  /** Stable identifier for the road segment. */
  id: string;
  /** Road name for display. */
  name: string;
  /** Congestion score in [0, 1] — 0 = free-flowing, 1 = gridlock. */
  congestion_score: number;
  /** WKT-free simple line: pairs of [lon, lat] describing the segment. */
  coordinates: [number, number][];
  notes?: string;
}

export type PrimaryLayer = "compound" | "flood";

export interface RiskWeights {
  floodWeight: number;
  congestionWeight: number;
  parkingWeight: number;
}

// ---------------------------------------------------------------------
// Live data layer (Open-Meteo).
//
// Everything below is derived at request time from Open-Meteo and is
// explicitly allowed to be unavailable — the static dataset under
// public/data/ remains the source of truth for zone geometry and
// long-run classification. See src/lib/liveRisk.ts.
// ---------------------------------------------------------------------

/** Rainfall aggregate for one sampling point. */
export interface LiveRainfall {
  latitude: number;
  longitude: number;
  /** Total precipitation over the observation window, in mm. */
  totalMm: number;
  /** Peak hourly precipitation in the window, in mm. */
  peakHourlyMm: number;
  /** 0–1 "how wet is the ground" measure. See summarizeForecast(). */
  saturation: number;
  /** True when the upstream call failed for this point. */
  failed?: boolean;
}

export interface LiveAirQuality {
  meanAqi: number;
  peakAqi: number;
  pm25: number;
}

/** Per-zone fusion of static classification and live observation. */
export interface ZoneLiveReading {
  zoneId: string;
  zoneName: string;
  /** The zone's risk_level as shipped in flood-risk.geojson. */
  staticRiskLevel: RiskLevel;
  /** Multiplier to apply to the zone's flood component. Always >= 1. */
  saturationMultiplier: number;
  observedTotalMm: number | null;
  observedPeakHourlyMm: number | null;
  saturation: number;
  airQuality: LiveAirQuality | null;
  /** Distance to the sampling point this reading came from, in km. */
  nearestSampleKm: number | null;
  /** True when the nearest sample is far enough away to warrant a caveat. */
  extrapolated: boolean;
}

export interface LiveRiskResponse {
  generatedAt: string;
  source: "Open-Meteo";
  samplePoints: number;
  successfulSamples: number;
  zones: ZoneLiveReading[];
  summary: {
    meanTotalMm: number;
    maxTotalMm: number;
    meanAqi: number;
    wetZones: number;
  };
}

/** The subset of a forecast the UI renders, independent of the raw API. */
export interface LiveObservation {
  totalMm: number;
  peakHourlyMm: number;
  saturation: number;
}

export interface AirQualitySample {
  meanAqi: number;
  peakAqi: number;
  pm25: number;
}

export interface PrecipitationSample {
  latitude: number;
  longitude: number;
  totalMm: number;
  peakHourlyMm: number;
}
