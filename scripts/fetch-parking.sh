#!/usr/bin/env bash
# Refreshes public/data/parking.geojson from live OpenStreetMap data via the
# Overpass API. Public endpoint, no auth needed. Klang Valley bounding box:
# south,west,north,east = 2.95,101.55,3.28,101.78 (see src/lib/config.ts).
set -euo pipefail

RAW="$(mktemp)"

curl -sS -G 'https://overpass-api.de/api/interpreter' \
  --data-urlencode "data=[out:json][timeout:60];(node[\"amenity\"=\"parking\"](2.95,101.55,3.28,101.78);way[\"amenity\"=\"parking\"](2.95,101.55,3.28,101.78););out center;" \
  -o "$RAW" \
  --max-time 90

node "$(dirname "$0")/convert-parking.mjs" "$RAW" "$(dirname "$0")/../public/data/parking.geojson"

rm -f "$RAW"
