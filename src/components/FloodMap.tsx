"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { KL_INITIAL_VIEW, MAPBOX_STYLE, MAPBOX_TOKEN } from "@/lib/config";
import { floodFillColorExpression } from "@/lib/riskColors";
import { parseCongestionCsv } from "@/lib/csv";
import Legend from "@/components/Legend";
import LayerControls from "@/components/LayerControls";
import type {
  FloodRiskFeatureCollection,
  ParkingFeatureCollection,
  PrimaryLayer,
} from "@/lib/types";
import type { CompoundRiskFeatureCollection } from "@/lib/compoundRisk";

const SRC = {
  flood: "flood-risk",
  compound: "compound-risk",
  parking: "parking",
  congestion: "congestion",
} as const;

const LYR = {
  floodFill: "flood-risk-fill",
  floodLine: "flood-risk-outline",
  compoundFill: "compound-risk-fill",
  compoundLine: "compound-risk-outline",
  parkingPoints: "parking-points",
  congestionLines: "congestion-lines",
} as const;

interface HoverInfo {
  title: string;
  lines: string[];
  x: number;
  y: number;
}

export default function FloodMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  const [primaryLayer, setPrimaryLayer] = useState<PrimaryLayer>("compound");
  const [showParking, setShowParking] = useState(false);
  const [showCongestion, setShowCongestion] = useState(false);

  // --- init map + load all data sources once ---------------------------
  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAPBOX_STYLE,
      center: [KL_INITIAL_VIEW.longitude, KL_INITIAL_VIEW.latitude],
      zoom: KL_INITIAL_VIEW.zoom,
      pitch: KL_INITIAL_VIEW.pitch,
      bearing: KL_INITIAL_VIEW.bearing,
    });

    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), "top-right");
    map.addControl(new mapboxgl.FullscreenControl(), "top-right");
    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", async () => {
      try {
        const [floodRes, compoundRes, parkingRes, congestionRes] = await Promise.all([
          fetch("/data/flood-risk.geojson"),
          fetch("/api/compound-risk"),
          fetch("/data/parking.geojson"),
          fetch("/data/congestion.csv"),
        ]);

        if (!floodRes.ok) throw new Error(`Failed to fetch flood data: ${floodRes.status}`);
        if (!compoundRes.ok) throw new Error(`Failed to fetch compound risk: ${compoundRes.status}`);
        if (!parkingRes.ok) throw new Error(`Failed to fetch parking data: ${parkingRes.status}`);
        if (!congestionRes.ok) throw new Error(`Failed to fetch congestion data: ${congestionRes.status}`);

        const floodData: FloodRiskFeatureCollection = await floodRes.json();
        const compoundData: CompoundRiskFeatureCollection = await compoundRes.json();
        const parkingData: ParkingFeatureCollection = await parkingRes.json();
        const congestionSegments = parseCongestionCsv(await congestionRes.text());

        const congestionLines: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: congestionSegments.map((seg) => ({
            type: "Feature",
            properties: { id: seg.id, name: seg.name, congestion_score: seg.congestion_score },
            geometry: { type: "LineString", coordinates: seg.coordinates },
          })),
        };

        // --- flood risk layer (reference / Phase 1) ---
        map.addSource(SRC.flood, { type: "geojson", data: floodData });
        map.addLayer({
          id: LYR.floodFill,
          type: "fill",
          source: SRC.flood,
          layout: { visibility: "none" },
          paint: { "fill-color": floodFillColorExpression as never, "fill-opacity": 0.55 },
        });
        map.addLayer({
          id: LYR.floodLine,
          type: "line",
          source: SRC.flood,
          layout: { visibility: "none" },
          paint: {
            "line-color": floodFillColorExpression as never,
            "line-width": 1.5,
            "line-opacity": 0.9,
          },
        });

        // --- compounding risk layer (primary / Phase 2) ---
        map.addSource(SRC.compound, { type: "geojson", data: compoundData });
        map.addLayer({
          id: LYR.compoundFill,
          type: "fill",
          source: SRC.compound,
          paint: { "fill-color": floodFillColorExpression as never, "fill-opacity": 0.7 },
        });
        map.addLayer({
          id: LYR.compoundLine,
          type: "line",
          source: SRC.compound,
          paint: {
            "line-color": "#ffffff",
            "line-width": 0.5,
            "line-opacity": 0.4,
          },
        });

        // --- parking reference layer (off by default) ---
        map.addSource(SRC.parking, { type: "geojson", data: parkingData });
        map.addLayer({
          id: LYR.parkingPoints,
          type: "circle",
          source: SRC.parking,
          layout: { visibility: "none" },
          paint: {
            "circle-radius": 2.5,
            "circle-color": "#2563eb",
            "circle-opacity": 0.6,
          },
        });

        // --- congestion reference layer (off by default) ---
        map.addSource(SRC.congestion, { type: "geojson", data: congestionLines });
        map.addLayer({
          id: LYR.congestionLines,
          type: "line",
          source: SRC.congestion,
          layout: { visibility: "none", "line-cap": "round" },
          paint: {
            "line-color": "#7c3aed",
            "line-width": ["interpolate", ["linear"], ["get", "congestion_score"], 0, 2, 1, 7],
            "line-opacity": 0.8,
          },
        });

        // --- hover interactions ---
        const attachHover = (
          layerId: string,
          build: (props: GeoJSON.GeoJsonProperties) => Omit<HoverInfo, "x" | "y">,
        ) => {
          map.on("mousemove", layerId, (e) => {
            map.getCanvas().style.cursor = "pointer";
            const f = e.features?.[0];
            if (!f) return;
            setHoverInfo({ ...build(f.properties), x: e.point.x, y: e.point.y });
          });
          map.on("mouseleave", layerId, () => {
            map.getCanvas().style.cursor = "";
            setHoverInfo(null);
          });
        };

        attachHover(LYR.floodFill, (p) => ({
          title: p?.name ?? "Unnamed zone",
          lines: [`Risk: ${p?.risk_level}`, p?.notes].filter(Boolean),
        }));

        attachHover(LYR.compoundFill, (p) => ({
          title: p?.zone_name ?? "Unnamed zone",
          lines: [
            `Compounding risk: ${p?.risk_level} (${Number(p?.score).toFixed(2)})`,
            `Flood: ${Number(p?.flood_component).toFixed(2)}  ·  Congestion: ${Number(
              p?.congestion_component,
            ).toFixed(2)}  ·  Parking: ${Number(p?.parking_component).toFixed(2)}`,
          ],
        }));

        setMapReady(true);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load map data");
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // --- react to layer toggle state ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setLayoutProperty(LYR.floodFill, "visibility", primaryLayer === "flood" ? "visible" : "none");
    map.setLayoutProperty(LYR.floodLine, "visibility", primaryLayer === "flood" ? "visible" : "none");
    map.setLayoutProperty(
      LYR.compoundFill,
      "visibility",
      primaryLayer === "compound" ? "visible" : "none",
    );
    map.setLayoutProperty(
      LYR.compoundLine,
      "visibility",
      primaryLayer === "compound" ? "visible" : "none",
    );
  }, [primaryLayer, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setLayoutProperty(LYR.parkingPoints, "visibility", showParking ? "visible" : "none");
  }, [showParking, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setLayoutProperty(LYR.congestionLines, "visibility", showCongestion ? "visible" : "none");
  }, [showCongestion, mapReady]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-100 px-6 text-center">
        <p className="text-lg font-semibold text-slate-800">Mapbox token missing</p>
        <p className="max-w-md text-sm text-slate-600">
          Add <code className="rounded bg-slate-200 px-1 py-0.5">NEXT_PUBLIC_MAPBOX_TOKEN</code> to{" "}
          <code className="rounded bg-slate-200 px-1 py-0.5">.env.local</code> at the project root,
          then restart the dev server.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" />

      {loadError && (
        <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
          {loadError}
        </div>
      )}

      <div className="pointer-events-none absolute left-4 top-4 rounded-lg bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <h1 className="text-base font-semibold text-slate-900">FloodFlow</h1>
        <p className="text-xs text-slate-500">Kuala Lumpur compounding risk — demo</p>
      </div>

      <LayerControls
        primaryLayer={primaryLayer}
        onPrimaryLayerChange={setPrimaryLayer}
        showParking={showParking}
        onShowParkingChange={setShowParking}
        showCongestion={showCongestion}
        onShowCongestionChange={setShowCongestion}
      />

      <Legend
        title={primaryLayer === "compound" ? "Compounding Risk" : "Flood Risk"}
      />

      {hoverInfo && (
        <div
          className="pointer-events-none absolute z-10 max-w-xs rounded-md bg-slate-900/95 px-3 py-2 text-xs text-white shadow-xl"
          style={{ left: hoverInfo.x + 14, top: hoverInfo.y + 14 }}
        >
          <p className="font-semibold">{hoverInfo.title}</p>
          {hoverInfo.lines.map((line, i) => (
            <p key={i} className={i === 0 ? "capitalize text-slate-300" : "mt-1 text-slate-400"}>
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
