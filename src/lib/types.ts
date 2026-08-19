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
