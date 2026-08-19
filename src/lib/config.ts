export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export const MAPBOX_STYLE = "mapbox://styles/mapbox/light-v11";

// Centered on the Klang River corridor through central KL / Klang Valley.
export const KL_INITIAL_VIEW = {
  longitude: 101.68,
  latitude: 3.12,
  zoom: 11.2,
  pitch: 0,
  bearing: 0,
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
