import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { computeCompoundRiskGrid } from "@/lib/compoundRisk";
import { parseCongestionCsv } from "@/lib/csv";
import { DEFAULT_RISK_WEIGHTS } from "@/lib/config";
import type {
  FloodRiskFeatureCollection,
  ParkingFeatureCollection,
  RiskWeights,
} from "@/lib/types";

function readWeight(searchParams: URLSearchParams, key: string, fallback: number): number {
  const raw = searchParams.get(key);
  if (raw == null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const weights: RiskWeights = {
    floodWeight: readWeight(searchParams, "floodWeight", DEFAULT_RISK_WEIGHTS.floodWeight),
    congestionWeight: readWeight(
      searchParams,
      "congestionWeight",
      DEFAULT_RISK_WEIGHTS.congestionWeight,
    ),
    parkingWeight: readWeight(searchParams, "parkingWeight", DEFAULT_RISK_WEIGHTS.parkingWeight),
  };

  const dataDir = path.join(process.cwd(), "public", "data");

  const [floodRaw, parkingRaw, congestionRaw] = await Promise.all([
    readFile(path.join(dataDir, "flood-risk.geojson"), "utf-8"),
    readFile(path.join(dataDir, "parking.geojson"), "utf-8"),
    readFile(path.join(dataDir, "congestion.csv"), "utf-8"),
  ]);

  const floodData: FloodRiskFeatureCollection = JSON.parse(floodRaw);
  const parkingData: ParkingFeatureCollection = JSON.parse(parkingRaw);
  const congestionSegments = parseCongestionCsv(congestionRaw);

  const grid = computeCompoundRiskGrid({
    floodData,
    parkingData,
    congestionSegments,
    weights,
  });

  return NextResponse.json(grid, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
