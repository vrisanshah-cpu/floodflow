import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { computeLiveRisk, gatherLiveReadings } from "@/lib/liveRisk";
import { CACHE_TTL_SECONDS } from "@/lib/services/openMeteo";
import type { FloodRiskFeatureCollection, LiveRiskResponse } from "@/lib/types";

// Nodes on Vercel need the edge-capable fetch; this route does live
// outbound calls so it must not be statically evaluated at build time.
export const dynamic = "force-dynamic";

/**
 * GET /api/live-risk
 *
 * Fuses the static flood-risk polygons with a live Open-Meteo observation
 * at each of a 3×3 grid of Klang Valley sampling points.
 *
 * Always returns 200 with a usable payload. When Open-Meteo is unreachable
 * (offline demo laptop, rate limit, venue wifi) every zone is reported
 * with `saturationMultiplier: 1` — i.e. "fall back to the static dataset"
 * — and `successfulSamples: 0` lets the UI say so out loud rather than
 * silently showing stale numbers as if they were live.
 */
export async function GET() {
  let floodData: FloodRiskFeatureCollection;
  try {
    const raw = await readFile(
      path.join(process.cwd(), "public", "data", "flood-risk.geojson"),
      "utf-8",
    );
    floodData = JSON.parse(raw) as FloodRiskFeatureCollection;
  } catch (err) {
    return NextResponse.json(
      {
        error: "flood_risk_unavailable",
        message: err instanceof Error ? err.message : "Could not read flood-risk.geojson",
      },
      { status: 500 },
    );
  }

  const { rainfall, airQuality } = await gatherLiveReadings();
  const response: LiveRiskResponse = computeLiveRisk({ floodData, rainfall, airQuality });

  const live = response.successfulSamples > 0;

  return NextResponse.json(response, {
    headers: {
      // Short client cache so a demo left open all afternoon still refreshes
      // without hammering the upstream free tier on every pan.
      "Cache-Control": live
        ? `public, max-age=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_TTL_SECONDS * 2}`
        : "no-store",
      "X-Live-Source": live ? "open-meteo" : "static-fallback",
    },
  });
}
