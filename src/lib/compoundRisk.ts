import * as turf from "@turf/turf";
import { CONGESTION_BUFFER_KM, GRID_CELL_SIZE_KM } from "./config";
import { RISK_LEVEL_MIDPOINT, scoreToRiskLevel } from "./riskColors";
import type {
  CongestionSegment,
  FloodRiskFeatureCollection,
  ParkingFeatureCollection,
  RiskWeights,
} from "./types";

export interface CompoundRiskCellProperties {
  id: string;
  zone_name: string;
  score: number;
  flood_component: number;
  congestion_component: number;
  parking_component: number;
  risk_level: string;
}

export type CompoundRiskFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  CompoundRiskCellProperties
>;

/** A "what if we retrofitted zone X" scenario: multiplies that zone's
 * flood component by (1 - factor). Not real hydrology — a simple, honest
 * way to communicate the concept for the demo. */
export interface FloodReductionScenario {
  zoneId: string;
  factor: number; // 0..1
}

interface ComputeArgs {
  floodData: FloodRiskFeatureCollection;
  parkingData: ParkingFeatureCollection;
  congestionSegments: CongestionSegment[];
  weights: RiskWeights;
  cellSizeKm?: number;
  bufferKm?: number;
  floodReduction?: FloodReductionScenario;
}

export function computeCompoundRiskGrid({
  floodData,
  parkingData,
  congestionSegments,
  weights,
  cellSizeKm = GRID_CELL_SIZE_KM,
  bufferKm = CONGESTION_BUFFER_KM,
  floodReduction,
}: ComputeArgs): CompoundRiskFeatureCollection {
  const congestionBuffers = congestionSegments
    .map((seg) => ({
      segment: seg,
      bufferPoly: turf.buffer(turf.lineString(seg.coordinates), bufferKm, {
        units: "kilometers",
      }),
    }))
    .filter(
      (b): b is { segment: CongestionSegment; bufferPoly: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> } =>
        b.bufferPoly != null,
    );

  const parkingPoints = parkingData.features;

  const outFeatures: GeoJSON.Feature<GeoJSON.Polygon, CompoundRiskCellProperties>[] = [];

  for (const floodFeature of floodData.features) {
    const props = floodFeature.properties;
    let floodComponent = props.risk_score ?? RISK_LEVEL_MIDPOINT[props.risk_level];
    if (floodReduction && floodReduction.zoneId === props.id) {
      floodComponent *= 1 - Math.min(1, Math.max(0, floodReduction.factor));
    }

    const zoneBbox = turf.bbox(floodFeature) as [number, number, number, number];
    const zoneGrid = turf.squareGrid(zoneBbox, cellSizeKm, { units: "kilometers" });

    // First pass: find cells that actually intersect the flood polygon and
    // their raw parking point counts (for later normalization).
    const candidateCells: {
      cell: GeoJSON.Feature<GeoJSON.Polygon>;
      congestionComponent: number;
      rawParkingCount: number;
    }[] = [];
    let maxRawParkingCount = 0;

    for (const cell of zoneGrid.features) {
      if (!turf.booleanIntersects(cell, floodFeature)) continue;

      let congestionComponent = 0;
      for (const { segment, bufferPoly } of congestionBuffers) {
        if (turf.booleanIntersects(cell, bufferPoly)) {
          congestionComponent = Math.max(congestionComponent, segment.congestion_score);
        }
      }

      let rawParkingCount = 0;
      for (const point of parkingPoints) {
        if (turf.booleanPointInPolygon(point, cell)) rawParkingCount++;
      }
      maxRawParkingCount = Math.max(maxRawParkingCount, rawParkingCount);

      candidateCells.push({ cell, congestionComponent, rawParkingCount });
    }

    candidateCells.forEach(({ cell, congestionComponent, rawParkingCount }, i) => {
      const parkingComponent =
        maxRawParkingCount > 0 ? rawParkingCount / maxRawParkingCount : 0;

      const score =
        weights.floodWeight * floodComponent +
        weights.congestionWeight * congestionComponent +
        weights.parkingWeight * parkingComponent;

      outFeatures.push({
        type: "Feature",
        properties: {
          id: `${props.id}-cell-${i}`,
          zone_name: props.name,
          score,
          flood_component: floodComponent,
          congestion_component: congestionComponent,
          parking_component: parkingComponent,
          risk_level: scoreToRiskLevel(score),
        },
        geometry: cell.geometry,
      });
    });
  }

  return { type: "FeatureCollection", features: outFeatures };
}
