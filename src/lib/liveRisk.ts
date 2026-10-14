// Live-data layer for FloodFlow.
//
// The static dataset under public/data/ describes *where* flood risk is
// (long-run polygons). Open-Meteo describes *what the weather is doing
// right now* at a set of points. This module fuses the two into a single
// per-zone "live" modifier so the map can show a demo that responds to
// today's rain instead of a frozen snapshot.

import { KLANG_VALLEY_BOUNDS } from "./config";
import {
  tryFetchAirQuality,
  tryFetchPrecipitation,
  summarizeAirQuality,
  summarizeForecast,
} from "./services/openMeteo";
import type {
  FloodRiskFeatureCollection,
  LiveAirQuality,
  LiveRainfall,
  LiveRiskResponse,
  ZoneLiveReading,
} from "./types";

/** Number of rain-sampling points spread across the Klang Valley box. */
const SAMPLE_GRID = 3;

/**
 * How much a fully-saturated catchment amplifies the static risk score.
 * 0.6 means "extremely wet ground can lift a zone's flood component by up
 * to 60%". Chosen to be visible on the map without letting live weather
 * completely override the long-run risk classification, which is the
 * dataset DBKL would actually be shown.
 */
export const MAX_SATURATION_UPLIFT = 0.6;

/**
 * Live observations get their own weight so a zone's displayed score moves
 * for a legible reason even when the static classification is coarse.
 */
export const LIVE_WEIGHT = 0.25;

/** Evenly spaced sample points across the Klang Valley bounding box. */
export function samplePoints(
  bounds: [[number, number], [number, number]] = KLANG_VALLEY_BOUNDS,
  grid: number = SAMPLE_GRID,
): { latitude: number; longitude: number }[] {
  const [[west, south], [east, north]] = bounds;
  const points: { latitude: number; longitude: number }[] = [];
  // grid - 1 steps at the edges would place points exactly on the corners;
  // inset by half a step so every sample sits inside the box and none of
  // them land in the sea off Port Klang.
  const step = 1 / (grid + 1);
  for (let i = 1; i <= grid; i++) {
    for (let j = 1; j <= grid; j++) {
      points.push({
        latitude: Number((south + (north - south) * step * i).toFixed(4)),
        longitude: Number((west + (east - west) * step * j).toFixed(4)),
      });
    }
  }
  return points;
}

/**
 * Haversine distance in kilometres. Small and dependency-free on purpose —
 * @turf/turf already ships a distance helper, but this runs per
 * (zone × sample point) pair on every request and turf's
 * coordinate-array validation dominates the cost at this volume.
 */
export function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Polygon centroid, falling back to the bbox centre for MultiPolygons. */
function zoneCentroid(feature: GeoJSON.Feature): { lat: number; lon: number } {
  const coords: number[][] = [];
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === "number" && typeof node[1] === "number") {
      coords.push(node as number[]);
      return;
    }
    node.forEach(walk);
  };
  walk((feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon | null)?.coordinates);

  if (!coords.length) return { lat: 0, lon: 0 };
  const sum = coords.reduce(
    (acc, c) => ({ lon: acc.lon + c[0], lat: acc.lat + c[1] }),
    { lon: 0, lat: 0 },
  );
  return { lat: sum.lat / coords.length, lon: sum.lon / coords.length };
}

export interface ComputeLiveRiskArgs {
  floodData: FloodRiskFeatureCollection;
  /** Per-sample-point rainfall; null entries mean that point failed. */
  rainfall: LiveRainfall[];
  /** Per-sample-point air quality; null entries mean that point failed. */
  airQuality?: (LiveAirQuality | null)[];
}

/**
 * Fuse live observations onto the static zones.
 *
 * Each zone takes the reading from its nearest successfully-sampled point
 * (inverse-distance would be more defensible for real hydrology, but with
 * a 3×3 grid over the Klang Valley the nearest point is what a hydrologist
 * would actually reach for, and it keeps the demo explainable).
 */
export function computeLiveRisk({
  floodData,
  rainfall,
  airQuality = [],
}: ComputeLiveRiskArgs): LiveRiskResponse {
  // A failed sample carries zeros that look like "no rain". Excluding it
  // here is what keeps a dead upstream call from silently reading as a
  // dry day and *lowering* every zone's confidence in its own dataset.
  const rainPoints = rainfall
    .map((r, i) => ({ r, i }))
    .filter((e): e is { r: LiveRainfall; i: number } => e.r != null && !e.r.failed);

  const zones: ZoneLiveReading[] = floodData.features.map((feature) => {
    const id = feature.properties.id;
    const { lat, lon } = zoneCentroid(feature);

    let nearest: { r: LiveRainfall; i: number; d: number } | null = null;
    for (const { r, i } of rainPoints) {
      const d = haversineKm(lat, lon, r.latitude, r.longitude);
      if (nearest === null || d < nearest.d) nearest = { r, i, d };
    }

    const rain = nearest?.r ?? null;
    const air = nearest ? (airQuality[nearest.i] ?? null) : null;
    // Clamped to [0, 1]: the multiplier must never drop a zone below its
    // static classification, whatever the upstream payload contains.
    const saturation = Math.min(1, Math.max(0, rain?.saturation ?? 0));
    const hasObservation = rain != null;

    return {
      zoneId: id,
      zoneName: feature.properties.name,
      // Static classification the dataset shipped with.
      staticRiskLevel: feature.properties.risk_level,
      /** multiplier applied to the zone's flood component */
      saturationMultiplier: Number((1 + MAX_SATURATION_UPLIFT * saturation).toFixed(3)),
      // null (not 0) when there is no usable sample — the UI distinguishes
      // "we measured no rain" from "we could not measure".
      observedTotalMm: hasObservation ? rain.totalMm : null,
      observedPeakHourlyMm: hasObservation ? rain.peakHourlyMm : null,
      saturation,
      airQuality: air,
      nearestSampleKm: nearest ? Number(nearest.d.toFixed(1)) : null,
      /** Distance is meaningless beyond this; the flag drives a UI caveat. */
      extrapolated: nearest ? nearest.d > 12 : false,
    };
  });

  const successful = rainPoints.length;
  const wetZones = zones.filter((z) => z.saturation > 0.2).length;

  // Only genuinely-measured samples contribute to the summary; a failed
  // point must not drag the displayed mean rainfall toward zero.
  const aqiReadings = airQuality.filter((a): a is LiveAirQuality => a != null);

  return {
    generatedAt: new Date().toISOString(),
    source: "Open-Meteo",
    samplePoints: rainfall.length,
    successfulSamples: successful,
    zones,
    summary: {
      meanTotalMm: successful
        ? Number(
            (
              rainPoints.reduce((sum, e) => sum + e.r.totalMm, 0) / successful
            ).toFixed(1),
          )
        : 0,
      maxTotalMm: successful
        ? Number(Math.max(...rainPoints.map((e) => e.r.totalMm)).toFixed(1))
        : 0,
      meanAqi: aqiReadings.length
        ? Number(
            (
              aqiReadings.reduce((sum, a) => sum + a.meanAqi, 0) / aqiReadings.length
            ).toFixed(0),
          )
        : 0,
      wetZones,
    },
  };
}

/** Fetch every sample point concurrently, never throwing. */
export async function gatherLiveReadings(
  bounds?: [[number, number], [number, number]],
): Promise<{ rainfall: LiveRainfall[]; airQuality: (LiveAirQuality | null)[] }> {
  const points = samplePoints(bounds);

  const rainfall = await Promise.all(
    points.map(async (p): Promise<LiveRainfall> => {
      const bundle = await tryFetchPrecipitation(p.latitude, p.longitude);
      if (!bundle) {
        return {
          latitude: p.latitude,
          longitude: p.longitude,
          totalMm: 0,
          peakHourlyMm: 0,
          saturation: 0,
          failed: true,
        };
      }
      const summary = summarizeForecast(bundle);
      return { latitude: p.latitude, longitude: p.longitude, ...summary };
    }),
  );

  const airQuality = await Promise.all(
    points.map(async (p) => {
      const bundle = await tryFetchAirQuality(p.latitude, p.longitude);
      return bundle ? summarizeAirQuality(bundle) : null;
    }),
  );

  return { rainfall, airQuality };
}
