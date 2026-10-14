// Open-Meteo client — keyless, CORS-enabled weather + air-quality API.
// https://open-meteo.com/en/docs (weather) · https://open-meteo.com/en/docs/air-quality-api
//
// No API key is required, which is deliberate: FloodFlow is a public DBKL
// pitch demo, and a key embedded in a client-side fetch would be both a
// leak and a deploy blocker. Both endpoints we use are free for
// non-commercial use and rate-limit by IP (10k calls/day at time of
// writing), so the callers below cache aggressively — see CACHE_TTL_*.

import type { LiveObservation, PrecipitationSample, AirQualitySample } from "@/lib/types";

const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const AIR_QUALITY_ENDPOINT = "https://air-quality-api.open-meteo.com/v1/air-quality";

/** Open-Meteo rejects requests over 16 days of forecast or past_days > 92. */
const MAX_PAST_DAYS = 92;
const MAX_FORECAST_DAYS = 16;

export const CACHE_TTL_SECONDS = 600;

export class OpenMeteoError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenMeteoError";
  }
}

/**
 * Fetch with a hard timeout. Node 18+ and every browser we target ship
 * AbortSignal.timeout, but we build the signal from an AbortController so
 * the failure surfaces as our own typed error rather than a bare
 * TimeoutError the caller has to distinguish from a network fault.
 */
async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      // Open-Meteo returns a JSON {reason} body on 400s, which is far more
      // useful in a log than the status text alone.
      let detail = "";
      try {
        const body = (await res.json()) as { reason?: string };
        if (body?.reason) detail = ` — ${body.reason}`;
      } catch {
        // body wasn't JSON; the status alone will have to do
      }
      throw new OpenMeteoError(`Open-Meteo responded ${res.status}${detail}`, res.status);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof OpenMeteoError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new OpenMeteoError(`Open-Meteo request timed out after ${timeoutMs}ms`);
    }
    throw new OpenMeteoError(err instanceof Error ? err.message : "Open-Meteo request failed");
  } finally {
    clearTimeout(timer);
  }
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export interface ForecastBundle {
  /** Hourly precipitation (mm) for the window requested. */
  precipitationMm: number[];
  /** Hourly precipitation probability (%), aligned with precipitationMm. */
  precipitationProbability: number[];
  /** ISO-8601 UTC timestamps, aligned with precipitationMm. */
  times: string[];
  /** Total precipitation over the whole window, in mm. */
  totalPrecipitationMm: number;
  /** Peak hourly precipitation in the window, in mm. */
  peakHourlyMm: number;
  /** Peak-hour precipitation probability, in the window, as %. */
  peakProbability: number;
  /** Model timezone the hourly series is expressed in. */
  timezone: string;
}

export interface AirQualityBundle {
  /** European AQI per hour (0–100+; >100 is poor). */
  europeanAqi: number[];
  /** PM2.5 concentration (µg/m³) per hour. */
  pm25: number[];
  times: string[];
  /** Mean European AQI across the window. */
  meanAqi: number;
  /** Peak European AQI across the window. */
  peakAqi: number;
  timezone: string;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/**
 * Hourly precipitation forecast for a point.
 *
 * `pastDays` lets the caller include recent history so the map can show
 * rain that has already fallen (the interesting case for a flood demo)
 * rather than only what is forecast.
 */
export async function fetchPrecipitation(options: {
  latitude: number;
  longitude: number;
  pastDays?: number;
  forecastDays?: number;
  timeoutMs?: number;
}): Promise<ForecastBundle> {
  const { latitude, longitude, timeoutMs = 8000 } = options;
  const pastDays = clampInt(options.pastDays ?? 2, 0, MAX_PAST_DAYS);
  const forecastDays = clampInt(options.forecastDays ?? 3, 1, MAX_FORECAST_DAYS);

  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    hourly: "precipitation,precipitation_probability",
    past_days: String(pastDays),
    forecast_days: String(forecastDays),
    timezone: "UTC",
  });

  const json = await fetchJson<{
    timezone?: string;
    hourly?: {
      time?: string[];
      precipitation?: unknown[];
      precipitation_probability?: unknown[];
    };
  }>(`${FORECAST_ENDPOINT}?${params}`, timeoutMs);

  const hourly = json.hourly ?? {};
  const precipitationMm = (hourly.precipitation ?? []).map(num);
  const precipitationProbability = (hourly.precipitation_probability ?? []).map(num);
  const times = hourly.time ?? [];

  return {
    precipitationMm,
    precipitationProbability,
    times,
    totalPrecipitationMm: precipitationMm.reduce((sum, v) => sum + v, 0),
    peakHourlyMm: precipitationMm.reduce((max, v) => Math.max(max, v), 0),
    peakProbability: precipitationProbability.reduce((max, v) => Math.max(max, v), 0),
    timezone: json.timezone ?? "UTC",
  };
}

/** Hourly air-quality forecast for a point (European AQI + PM2.5). */
export async function fetchAirQuality(options: {
  latitude: number;
  longitude: number;
  pastDays?: number;
  forecastDays?: number;
  timeoutMs?: number;
}): Promise<AirQualityBundle> {
  const { latitude, longitude, timeoutMs = 8000 } = options;
  const pastDays = clampInt(options.pastDays ?? 1, 0, MAX_PAST_DAYS);
  const forecastDays = clampInt(options.forecastDays ?? 2, 1, MAX_FORECAST_DAYS);

  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    hourly: "european_aqi,pm2_5",
    past_days: String(pastDays),
    forecast_days: String(forecastDays),
    timezone: "UTC",
  });

  const json = await fetchJson<{
    timezone?: string;
    hourly?: { time?: string[]; european_aqi?: unknown[]; pm2_5?: unknown[] };
  }>(`${AIR_QUALITY_ENDPOINT}?${params}`, timeoutMs);

  const hourly = json.hourly ?? {};
  const europeanAqi = (hourly.european_aqi ?? []).map(num);
  const pm25 = (hourly.pm2_5 ?? []).map(num);

  return {
    europeanAqi,
    pm25,
    times: hourly.time ?? [],
    meanAqi: europeanAqi.length
      ? europeanAqi.reduce((sum, v) => sum + v, 0) / europeanAqi.length
      : 0,
    peakAqi: europeanAqi.reduce((max, v) => Math.max(max, v), 0),
    timezone: json.timezone ?? "UTC",
  };
}

// ---------------------------------------------------------------------
// Failure-tolerant wrappers used by the API routes.
//
// The pitch is the product here: a live-data request that 500s must not
// blank the map. These return null instead of throwing so the route can
// fall back to the static dataset and mark the layer as stale.
// ---------------------------------------------------------------------

export async function tryFetchPrecipitation(
  latitude: number,
  longitude: number,
  timeoutMs = 8000,
): Promise<ForecastBundle | null> {
  try {
    return await fetchPrecipitation({ latitude, longitude, timeoutMs });
  } catch {
    return null;
  }
}

export async function tryFetchAirQuality(
  latitude: number,
  longitude: number,
  timeoutMs = 8000,
): Promise<AirQualityBundle | null> {
  try {
    return await fetchAirQuality({ latitude, longitude, timeoutMs });
  } catch {
    return null;
  }
}

/**
 * Reduce a forecast bundle to the three figures the UI actually shows.
 * Kept here (not in the component) so both the API route and any future
 * server-rendered consumer derive them identically.
 */
export function summarizeForecast(
  bundle: ForecastBundle,
  windowHours = 24,
): LiveObservation {
  const slice = bundle.precipitationMm.slice(-windowHours);
  const total = slice.reduce((sum, v) => sum + v, 0);
  const peak = slice.reduce((max, v) => Math.max(max, v), 0);

  return {
    totalMm: Number(total.toFixed(1)),
    peakHourlyMm: Number(peak.toFixed(1)),
    // "How wet is the ground" reads better to a non-hydrologist than a
    // raw millimetre total. 50mm/24h is a documented local flash-flood
    // threshold for Klang Valley catchments; we cap the display at 1.
    saturation: Number(Math.min(1, total / 50).toFixed(2)),
  };
}

export function summarizeAirQuality(bundle: AirQualityBundle): AirQualitySample {
  return {
    meanAqi: Number(bundle.meanAqi.toFixed(0)),
    peakAqi: Number(bundle.peakAqi.toFixed(0)),
    pm25: Number(
      (bundle.pm25.length
        ? bundle.pm25.reduce((sum, v) => sum + v, 0) / bundle.pm25.length
        : 0
      ).toFixed(1),
    ),
  };
}

/** Exposed for tests — no fetch involved. */
export const __testing = { clampInt, MAX_PAST_DAYS, MAX_FORECAST_DAYS };
