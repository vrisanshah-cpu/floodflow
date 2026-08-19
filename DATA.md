# FloodFlow — Data Ingestion Spec

This app reads data from static files in `public/data/`. No live API, no
database required for the demo. Drop a file in, update the fetch path if the
filename changes, done.

## 1. Flood risk (Phase 1 — active now)

**File:** `public/data/flood-risk.geojson`
**Format:** GeoJSON `FeatureCollection` of `Polygon` or `MultiPolygon`.

```json
{
  "type": "Feature",
  "properties": {
    "id": "unique-slug",
    "name": "Human-readable zone name",
    "risk_level": "low | medium | high | extreme",
    "risk_score": 0.0,
    "notes": "optional freeform note, e.g. historical event",
    "source": "optional citation"
  },
  "geometry": { "type": "Polygon", "coordinates": [...] }
}
```

- `risk_level` is required — it drives the color scale directly.
- `risk_score` (0–1) is optional. If present, it's used for the compounding
  risk math in Phase 2 instead of the bucket midpoint. If you're exporting
  from DID/JPS hazard maps and only have a categorical rating, just supply
  `risk_level` and skip `risk_score` — the app will use a sane default.
- Coordinates are `[longitude, latitude]`, standard GeoJSON order.

**Where this currently comes from:** a hand-placed 6-polygon placeholder
covering well-documented KL/Klang Valley flood hotspots (Taman Sri Muda,
the Klang–Gombak confluence, Kampung Baru, Pantai Dalam, Sri Petaling, and
Jalan Tun Razak) so the map is visually credible before real data arrives.
Every placeholder feature is tagged `"source": "Approximate — replace with
real DID/JPS flood hazard polygon"` so it's obvious what's fake once you
inspect the file.

**To replace with real data:** export your DID/JPS-derived shapes (or
historical flood event points buffered into small polygons) as GeoJSON in
the shape above and overwrite `public/data/flood-risk.geojson`. If your
source is a shapefile, `ogr2ogr -f GeoJSON out.geojson in.shp` (GDAL) or
QGIS's "Export > Save As GeoJSON" both work.

## 2. Parking (Phase 2 — active now)

**File:** `public/data/parking.geojson`
**Format:** GeoJSON `FeatureCollection` of `Point`.

```json
{
  "type": "Feature",
  "properties": {
    "id": "unique-slug",
    "name": "optional",
    "capacity": 0,
    "parking_type": "optional, e.g. surface | multi-storey | street"
  },
  "geometry": { "type": "Point", "coordinates": [lon, lat] }
}
```

**Where this currently comes from:** pulled live from the OSM Overpass API
for the Klang Valley bounding box (`101.55, 2.95, 101.78, 3.28`) —
2,547 tagged parking locations as of this writing. Re-run
`scripts/fetch-parking.sh` any time to refresh it; the script hits the
public Overpass endpoint (no auth needed) and rewrites this file via
`scripts/convert-parking.mjs`.

## 3. Congestion (Phase 2 — active now, placeholder values)

**File:** `public/data/congestion.csv`
**Format:** CSV, one row per road segment.

```csv
id,name,congestion_score,notes,lon1,lat1,lon2,lat2
jln-tun-razak-1,Jalan Tun Razak (Pudu section),0.72,"peak-hour estimate",101.703,3.134,101.716,3.144
```

- `congestion_score` is 0–1 (0 = free-flowing, 1 = gridlock).
- Coordinates describe a simple two-point line per segment (start/end). If
  you have more detail (multi-point segments), tell me and I'll extend the
  schema — a simple two-point line is enough for the demo's visual purpose.
- If you don't have real congestion data, rough manual estimates per known
  arterial road are fine — this is explicitly a demo, not a live feed.

**Where this currently comes from:** 8 hand-estimated segments — one
covering each flood zone (so the compounding effect has something to
compound with) plus two calmer contrast segments outside any flood zone.
Every row is tagged as a manual estimate in its `notes` column. Replace with
real numbers whenever you have them; the schema won't change.

## Compounding risk score (Phase 2 — active now)

Computed server-side at `GET /api/compound-risk`, not hardcoded into the
client:

```
score = floodWeight * floodComponent + congestionWeight * congestionComponent + parkingWeight * parkingComponent
```

- The grid is scoped to cells that overlap a flood polygon (0.5km cells) —
  congestion and parking amplify existing flood risk rather than diluting it
  with ambient parking noise across the whole valley.
- `floodComponent` = the zone's `risk_score` (or bucket midpoint).
- `congestionComponent` = the highest `congestion_score` among segments
  within ~350m of the cell.
- `parkingComponent` = the cell's parking-point count, normalized against
  the busiest cell in that same flood zone.
- Weights default to `{ flood: 0.5, congestion: 0.3, parking: 0.2 }`
  (`src/lib/config.ts` → `DEFAULT_RISK_WEIGHTS`) and can be overridden per
  request via query params, e.g.
  `/api/compound-risk?floodWeight=0.6&congestionWeight=0.2&parkingWeight=0.2`.

## What-if scenario (Phase 3 — active now)

The same endpoint accepts an optional `zoneId` + `floodReduction` (0–1) pair,
used by the case-study slider:

```
/api/compound-risk?zoneId=shah-alam-sri-muda&floodReduction=0.4
```

This multiplies just that zone's `floodComponent` by `(1 - floodReduction)`
before scoring — a simple, honest stand-in for "what if this area's
impervious surface / drainage capacity were improved," not real hydrology.
The case-study zone is `CASE_STUDY_ZONE_ID` in `src/lib/config.ts`, currently
pointed at Taman Sri Muda (the Dec 2021 flood).

## Map engine

Leaflet + raw OpenStreetMap tiles (`{s}.tile.openstreetmap.org`) — no API
key, no cost, no signup. This was a deliberate choice over Mapbox GL JS
(Mapbox requires a card on file to generate a token). For anything beyond
demo-scale traffic, OSM's tile usage policy asks that production apps run
their own tile server or use a paid tile provider — fine for a pitch demo,
worth revisiting if this becomes a real deployed tool.

## Languages

UI chrome (labels, legend, buttons) is translated via
`src/lib/i18n/translations.ts` into Malaysia's core languages (Bahasa
Malaysia — default, English, Chinese, Tamil) plus the languages of its
closest neighbors (Indonesian, Thai, Filipino). Dataset *content* — flood
zone notes, road names — is not translated; it stays as sourced (English/
Malay mix, matching how DID/JPS and OSM data actually reads).
