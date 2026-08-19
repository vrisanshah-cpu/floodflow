// One-off conversion of a raw Overpass API response into the app's
// ParkingFeatureCollection schema (see DATA.md #2). Re-run fetch-parking.sh
// (documented in DATA.md) periodically to refresh, then re-run this script.
import { readFileSync, writeFileSync } from "fs";

const rawPath = process.argv[2];
const outPath = process.argv[3];

if (!rawPath || !outPath) {
  console.error("Usage: node convert-parking.mjs <raw-overpass.json> <out.geojson>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(rawPath, "utf-8"));

const features = raw.elements
  .map((el) => {
    const lon = el.type === "node" ? el.lon : el.center?.lon;
    const lat = el.type === "node" ? el.lat : el.center?.lat;
    if (lon == null || lat == null) return null;

    const tags = el.tags ?? {};
    return {
      type: "Feature",
      properties: {
        id: `osm-${el.type}-${el.id}`,
        name: tags.name ?? undefined,
        capacity: tags.capacity ? Number(tags.capacity) : undefined,
        parking_type: tags.parking ?? undefined,
        source: "OpenStreetMap via Overpass API",
      },
      geometry: { type: "Point", coordinates: [lon, lat] },
    };
  })
  .filter(Boolean);

const fc = { type: "FeatureCollection", features };
writeFileSync(outPath, JSON.stringify(fc));
console.log(`Wrote ${features.length} parking features to ${outPath}`);
