import { describe, expect, it } from "vitest";
import {
  computeLiveRisk,
  haversineKm,
  samplePoints,
  MAX_SATURATION_UPLIFT,
} from "./liveRisk";
import { __testing, summarizeForecast } from "./services/openMeteo";
import type { FloodRiskFeatureCollection, LiveRainfall } from "./types";

function zone(
  id: string,
  name: string,
  risk: "low" | "medium" | "high" | "extreme",
  bbox: [number, number, number, number],
): GeoJSON.Feature<GeoJSON.Polygon> {
  const [west, south, east, north] = bbox;
  return {
    type: "Feature",
    properties: { id, name, risk_level: risk },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
  } as GeoJSON.Feature<GeoJSON.Polygon>;
}

const floodData = {
  type: "FeatureCollection",
  features: [
    // Centred on the Klang Valley sample grid (~101.63, 3.10)
    zone("kl-central", "KL Central", "high", [101.60, 3.08, 101.66, 3.12]),
    zone("shah-alam", "Shah Alam", "extreme", [101.50, 3.00, 101.56, 3.04]),
  ],
} as unknown as FloodRiskFeatureCollection;

function rain(
  latitude: number,
  longitude: number,
  totalMm: number,
  saturation: number,
): LiveRainfall {
  return {
    latitude,
    longitude,
    totalMm,
    peakHourlyMm: totalMm / 4,
    saturation,
  };
}

describe("haversineKm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineKm(3.12, 101.68, 3.12, 101.68)).toBe(0);
  });

  it("matches a known distance between KL and Shah Alam (~20 km)", () => {
    // KLCC → Shah Alam city centre is ~20–23 km as the crow flies.
    const d = haversineKm(3.1578, 101.7117, 3.0733, 101.5185);
    expect(d).toBeGreaterThan(18);
    expect(d).toBeLessThan(25);
  });

  it("is symmetric", () => {
    const a = haversineKm(3.1, 101.6, 3.2, 101.7);
    const b = haversineKm(3.2, 101.7, 3.1, 101.6);
    expect(a).toBeCloseTo(b, 10);
  });
});

describe("samplePoints", () => {
  it("produces grid × grid interior points", () => {
    expect(samplePoints(undefined, 3)).toHaveLength(9);
    expect(samplePoints(undefined, 4)).toHaveLength(16);
  });

  it("keeps every point strictly inside the bounding box", () => {
    const bounds: [[number, number], [number, number]] = [
      [101.0, 3.0],
      [102.0, 4.0],
    ];
    for (const p of samplePoints(bounds, 3)) {
      expect(p.longitude).toBeGreaterThan(101.0);
      expect(p.longitude).toBeLessThan(102.0);
      expect(p.latitude).toBeGreaterThan(3.0);
      expect(p.latitude).toBeLessThan(4.0);
    }
  });
});

describe("summarizeForecast", () => {
  it("totals and peaks the trailing window only", () => {
    const bundle = {
      precipitationMm: [99, 99, 1, 2, 3, 4],
      precipitationProbability: [0, 0, 10, 20, 30, 40],
      times: [],
      totalPrecipitationMm: 208,
      peakHourlyMm: 99,
      peakProbability: 40,
      timezone: "UTC",
    };
    const s = summarizeForecast(bundle, 4);
    expect(s.totalMm).toBe(10);
    expect(s.peakHourlyMm).toBe(4);
  });

  it("caps saturation at 1 even for extreme rainfall", () => {
    const bundle = {
      precipitationMm: Array(24).fill(20), // 480 mm — far past any real threshold
      precipitationProbability: [],
      times: [],
      totalPrecipitationMm: 480,
      peakHourlyMm: 20,
      peakProbability: 0,
      timezone: "UTC",
    };
    expect(summarizeForecast(bundle, 24).saturation).toBe(1);
  });

  it("reports zero saturation for a dry window", () => {
    const bundle = {
      precipitationMm: Array(24).fill(0),
      precipitationProbability: Array(24).fill(0),
      times: [],
      totalPrecipitationMm: 0,
      peakHourlyMm: 0,
      peakProbability: 0,
      timezone: "UTC",
    };
    expect(summarizeForecast(bundle, 24).saturation).toBe(0);
  });
});

describe("clampInt", () => {
  it("clamps to the Open-Meteo permitted ranges", () => {
    expect(__testing.clampInt(-5, 0, 92)).toBe(0);
    expect(__testing.clampInt(500, 0, 92)).toBe(92);
    expect(__testing.clampInt(7.9, 0, 92)).toBe(7);
  });

  it("returns the minimum for non-finite input rather than NaN", () => {
    expect(__testing.clampInt(Number.NaN, 1, 16)).toBe(1);
    expect(__testing.clampInt(Number.POSITIVE_INFINITY, 1, 16)).toBe(1);
  });
});

describe("computeLiveRisk", () => {
  it("marks every zone saturated-neutral when all samples failed", () => {
    const failed: LiveRainfall[] = [
      { latitude: 3.1, longitude: 101.6, totalMm: 0, peakHourlyMm: 0, saturation: 0, failed: true },
    ];
    const result = computeLiveRisk({ floodData, rainfall: failed });

    expect(result.successfulSamples).toBe(0);
    expect(result.summary.wetZones).toBe(0);
    for (const z of result.zones) {
      expect(z.saturationMultiplier).toBe(1);
      // null, not 0 — "we could not measure" must stay distinguishable
      // from "we measured no rain".
      expect(z.observedTotalMm).toBeNull();
      expect(z.nearestSampleKm).toBeNull();
    }
  });

  it("applies the full uplift at saturation = 1", () => {
    const readings = [rain(3.1, 101.63, 50, 1)];
    const result = computeLiveRisk({ floodData, rainfall: readings });

    const kl = result.zones.find((z) => z.zoneId === "kl-central")!;
    expect(kl.saturation).toBe(1);
    expect(kl.saturationMultiplier).toBeCloseTo(1 + MAX_SATURATION_UPLIFT, 5);
  });

  it("leaves the multiplier at 1 for a dry zone", () => {
    const result = computeLiveRisk({
      floodData,
      rainfall: [rain(3.1, 101.63, 0, 0)],
    });
    expect(result.zones.every((z) => z.saturationMultiplier === 1)).toBe(true);
  });

  it("assigns each zone its nearest sample point", () => {
    const readings = [
      rain(3.09, 101.62, 10, 0.2), // near KL Central
      rain(3.02, 101.53, 40, 0.8), // near Shah Alam
    ];
    const result = computeLiveRisk({ floodData, rainfall: readings });

    const kl = result.zones.find((z) => z.zoneId === "kl-central")!;
    const sa = result.zones.find((z) => z.zoneId === "shah-alam")!;

    expect(kl.observedTotalMm).toBe(10);
    expect(sa.observedTotalMm).toBe(40);
    // Shah Alam is the wetter zone, so it must be uplifted more.
    expect(sa.saturationMultiplier).toBeGreaterThan(kl.saturationMultiplier);
  });

  it("flags zones whose nearest sample is far away as extrapolated", () => {
    const readings = [rain(3.10, 101.63, 5, 0.1)]; // one point only
    const result = computeLiveRisk({ floodData, rainfall: readings });

    const sa = result.zones.find((z) => z.zoneId === "shah-alam")!;
    expect(sa.nearestSampleKm).toBeGreaterThan(12);
    expect(sa.extrapolated).toBe(true);
  });

  it("preserves the static risk level on every zone", () => {
    const result = computeLiveRisk({
      floodData,
      rainfall: [rain(3.1, 101.63, 50, 1)],
    });
    expect(result.zones.find((z) => z.zoneId === "kl-central")!.staticRiskLevel).toBe("high");
    expect(result.zones.find((z) => z.zoneId === "shah-alam")!.staticRiskLevel).toBe("extreme");
  });

  it("attaches air quality only where a sample exists", () => {
    const result = computeLiveRisk({
      floodData,
      rainfall: [rain(3.1, 101.63, 5, 0.1), rain(3.02, 101.53, 5, 0.1)],
      airQuality: [{ meanAqi: 62, peakAqi: 90, pm25: 18.4 }, null],
    });

    const zones = result.zones;
    const withAir = zones.filter((z) => z.airQuality != null);
    expect(withAir).toHaveLength(1);
    expect(withAir[0].airQuality!.meanAqi).toBe(62);
  });

  it("counts wet zones using the 0.2 saturation threshold", () => {
    const readings = [
      rain(3.09, 101.62, 12, 0.25), // wet
      rain(3.02, 101.53, 1, 0.02), // dry
    ];
    const result = computeLiveRisk({ floodData, rainfall: readings });
    expect(result.summary.wetZones).toBe(1);
  });

  it("never returns a multiplier below 1", () => {
    // Defensive: a negative saturation (bad upstream payload) must not
    // reduce a zone's risk below its static classification.
    const result = computeLiveRisk({
      floodData,
      rainfall: [rain(3.1, 101.63, 0, -5)],
    });
    expect(result.zones.every((z) => z.saturationMultiplier >= 1)).toBe(true);
  });

  it("returns one reading per zone in the static dataset", () => {
    const result = computeLiveRisk({
      floodData,
      rainfall: [rain(3.1, 101.63, 5, 0.1)],
    });
    expect(result.zones).toHaveLength(floodData.features.length);
    expect(result.source).toBe("Open-Meteo");
  });
});
