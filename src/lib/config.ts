export const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Centered on the Klang River corridor through central KL / Klang Valley.
// [lat, lon] — Leaflet's coordinate order, not GeoJSON's [lon, lat].
export const KL_INITIAL_VIEW = {
  center: [3.12, 101.68] as [number, number],
  zoom: 11,
};

export const KLANG_VALLEY_BOUNDS: [[number, number], [number, number]] = [
  [101.55, 2.95], // SW
  [101.78, 3.28], // NE
];

// Compounding risk grid — how finely we chop flood zones to reveal
// congestion/parking hot spots within them.
export const GRID_CELL_SIZE_KM = 0.5;

// How far a congestion segment's influence extends into neighboring cells.
export const CONGESTION_BUFFER_KM = 0.35;

// Default weighted-sum weights for the compounding risk score. Configurable
// per-request via /api/compound-risk query params, not hardcoded into the
// scoring logic itself.
export const DEFAULT_RISK_WEIGHTS = {
  floodWeight: 0.5,
  congestionWeight: 0.3,
  parkingWeight: 0.2,
};

// Phase 3 case study: the best-documented flood event in the placeholder
// dataset (Dec 2021 Klang Valley floods). Must match a feature id in
// public/data/flood-risk.geojson.
export const CASE_STUDY_ZONE_ID = "shah-alam-sri-muda";
export const CASE_STUDY_VIEW = {
  center: [3.0485, 101.533] as [number, number],
  zoom: 14,
};
