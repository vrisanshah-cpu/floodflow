"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  CASE_STUDY_VIEW,
  CASE_STUDY_ZONE_ID,
  KL_INITIAL_VIEW,
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
} from "@/lib/config";
import { riskLevelColor } from "@/lib/riskColors";
import { parseCongestionCsv } from "@/lib/csv";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import Legend from "@/components/Legend";
import LayerControls from "@/components/LayerControls";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import CaseStudyPanel from "@/components/CaseStudyPanel";
import type {
  FloodRiskFeatureCollection,
  ParkingFeatureCollection,
  PrimaryLayer,
} from "@/lib/types";
import type { CompoundRiskFeatureCollection } from "@/lib/compoundRisk";

interface HoverInfo {
  title: string;
  lines: string[];
  x: number;
  y: number;
}

export default function FloodMap() {
  const { t } = useLanguage();
  // Leaflet event handlers are bound once on load and close over this ref
  // rather than `t` directly, so hover text stays current after a language
  // switch without needing to rebind every layer's listeners.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const floodLayerRef = useRef<L.GeoJSON | null>(null);
  const compoundLayerRef = useRef<L.GeoJSON | null>(null);
  const parkingLayerRef = useRef<L.GeoJSON | null>(null);
  const congestionLayerRef = useRef<L.GeoJSON | null>(null);

  const [floodData, setFloodData] = useState<FloodRiskFeatureCollection | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  const [primaryLayer, setPrimaryLayer] = useState<PrimaryLayer>("compound");
  const [showParking, setShowParking] = useState(false);
  const [showCongestion, setShowCongestion] = useState(false);
  const [menuOpen, setMenuOpen] = useState(true);

  // Keyboard shortcut: M opens the layer menu. Deliberately one-directional
  // (not a toggle, not tied to keyup) — a toggle-on-keydown breaks under
  // the browser's key auto-repeat (holding the key re-fires keydown and
  // flips it straight back closed), and a hold-to-show/release-to-hide
  // version depends on the keyup event actually reaching this listener,
  // which isn't reliable across every browser/OS/focus state. Closing is
  // the ☰ button's job — that's a plain click, nothing to get wrong.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.key.toLowerCase() !== "m" || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      setMenuOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const [caseStudyOpen, setCaseStudyOpen] = useState(false);
  const [reduction, setReduction] = useState(0);
  const [baselineScore, setBaselineScore] = useState<number | null>(null);
  const [simulatedScore, setSimulatedScore] = useState<number | null>(null);

  // --- init map + load all data sources once ---------------------------
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Next dev (React Strict Mode) mounts, cleans up, then mounts again.
    // The data fetch below can still be in flight when that first cleanup
    // runs and tears the map down — this flag stops it from touching a
    // dead map afterwards (Leaflet throws on appendChild to a removed pane).
    let cancelled = false;

    const map = L.map(mapContainerRef.current, {
      center: KL_INITIAL_VIEW.center,
      zoom: KL_INITIAL_VIEW.zoom,
    });
    mapRef.current = map;

    L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    L.control.scale({ metric: true, imperial: false }).addTo(map);

    const attachHover = (layer: L.Layer, build: (props: GeoJSON.GeoJsonProperties) => Omit<HoverInfo, "x" | "y">) => {
      layer.on("mouseover", (e: L.LeafletMouseEvent) => {
        const props = (e.target as L.Path & { feature?: GeoJSON.Feature }).feature?.properties;
        const point = map.latLngToContainerPoint(e.latlng);
        setHoverInfo({ ...build(props ?? null), x: point.x, y: point.y });
      });
      layer.on("mousemove", (e: L.LeafletMouseEvent) => {
        const point = map.latLngToContainerPoint(e.latlng);
        setHoverInfo((prev) => (prev ? { ...prev, x: point.x, y: point.y } : prev));
      });
      layer.on("mouseout", () => setHoverInfo(null));
    };

    (async () => {
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

        if (cancelled) return;
        setFloodData(floodData);

        const congestionLines: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: congestionSegments.map((seg) => ({
            type: "Feature",
            properties: { id: seg.id, name: seg.name, congestion_score: seg.congestion_score },
            geometry: { type: "LineString", coordinates: seg.coordinates },
          })),
        };

        // --- flood risk layer (reference / Phase 1) ---
        const floodLayer = L.geoJSON(floodData, {
          style: (f) => ({
            color: riskLevelColor(f?.properties?.risk_level),
            weight: 1.5,
            fillColor: riskLevelColor(f?.properties?.risk_level),
            fillOpacity: 0.55,
          }),
        });
        floodLayer.eachLayer((layer) =>
          attachHover(layer, (p) => ({
            title: p?.name ?? "Unnamed zone",
            lines: [`${tRef.current("hover.risk")}: ${p?.risk_level}`, p?.notes].filter(Boolean),
          })),
        );
        floodLayerRef.current = floodLayer;

        // --- compounding risk layer (primary / Phase 2) ---
        const compoundLayer = L.geoJSON(compoundData, {
          style: (f) => ({
            color: "#ffffff",
            weight: 0.5,
            opacity: 0.4,
            fillColor: riskLevelColor(f?.properties?.risk_level),
            fillOpacity: 0.7,
          }),
        });
        compoundLayer.eachLayer((layer) =>
          attachHover(layer, (p) => ({
            title: p?.zone_name ?? "Unnamed zone",
            lines: [
              `${tRef.current("hover.compoundingRisk")}: ${p?.risk_level} (${Number(p?.score).toFixed(2)})`,
              `${tRef.current("hover.flood")}: ${Number(p?.flood_component).toFixed(2)} · ${tRef.current(
                "hover.congestion",
              )}: ${Number(p?.congestion_component).toFixed(2)} · ${tRef.current(
                "hover.parking",
              )}: ${Number(p?.parking_component).toFixed(2)}`,
            ],
          })),
        );
        compoundLayerRef.current = compoundLayer;
        compoundLayer.addTo(map);

        // --- parking reference layer (off by default) ---
        parkingLayerRef.current = L.geoJSON(parkingData, {
          pointToLayer: (_f, latlng) =>
            L.circleMarker(latlng, {
              radius: 2.5,
              color: "#2563eb",
              fillColor: "#2563eb",
              fillOpacity: 0.6,
              weight: 0,
            }),
        });

        // --- congestion reference layer (off by default) ---
        congestionLayerRef.current = L.geoJSON(congestionLines, {
          style: (f) => ({
            color: "#7c3aed",
            weight: 2 + (Number(f?.properties?.congestion_score) || 0) * 5,
            opacity: 0.8,
          }),
        });

        setMapReady(true);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load map data");
      }
    })();

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // --- react to layer toggle state ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const flood = floodLayerRef.current!;
    const compound = compoundLayerRef.current!;
    if (primaryLayer === "flood") {
      map.addLayer(flood);
      map.removeLayer(compound);
    } else {
      map.addLayer(compound);
      map.removeLayer(flood);
    }
  }, [primaryLayer, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = parkingLayerRef.current;
    if (!map || !mapReady || !layer) return;
    if (showParking) map.addLayer(layer);
    else map.removeLayer(layer);
  }, [showParking, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = congestionLayerRef.current;
    if (!map || !mapReady || !layer) return;
    if (showCongestion) map.addLayer(layer);
    else map.removeLayer(layer);
  }, [showCongestion, mapReady]);

  // --- case study: fetch scenario-adjusted grid whenever reduction changes ---
  useEffect(() => {
    if (!mapReady || !caseStudyOpen) return;

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/compound-risk?zoneId=${encodeURIComponent(CASE_STUDY_ZONE_ID)}&floodReduction=${reduction}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const data: CompoundRiskFeatureCollection = await res.json();

        const zoneCells = data.features.filter((f) => f.properties.id.startsWith(`${CASE_STUDY_ZONE_ID}-cell-`));
        const maxScore = zoneCells.reduce((m, f) => Math.max(m, f.properties.score), 0);

        if (reduction === 0) setBaselineScore(maxScore);
        setSimulatedScore(maxScore);

        const compoundLayer = compoundLayerRef.current;
        if (compoundLayer && primaryLayer === "compound") {
          compoundLayer.clearLayers();
          compoundLayer.addData(data);
          compoundLayer.eachLayer((layer) => {
            layer.on("mouseover", (e: L.LeafletMouseEvent) => {
              const p = (e.target as L.Path & { feature?: GeoJSON.Feature }).feature?.properties;
              const point = mapRef.current!.latLngToContainerPoint(e.latlng);
              setHoverInfo({
                title: p?.zone_name ?? "Unnamed zone",
                lines: [
                  `${tRef.current("hover.compoundingRisk")}: ${p?.risk_level} (${Number(p?.score).toFixed(2)})`,
                ],
                x: point.x,
                y: point.y,
              });
            });
            layer.on("mousemove", (e: L.LeafletMouseEvent) => {
              const point = mapRef.current!.latLngToContainerPoint(e.latlng);
              setHoverInfo((prev) => (prev ? { ...prev, x: point.x, y: point.y } : prev));
            });
            layer.on("mouseout", () => setHoverInfo(null));
          });
        }
      } catch {
        // aborted or transient — ignore, next slider tick will retry
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [reduction, caseStudyOpen, mapReady, primaryLayer]);

  const openCaseStudy = () => {
    setCaseStudyOpen(true);
    setPrimaryLayer("compound");
    mapRef.current?.flyTo(CASE_STUDY_VIEW.center, CASE_STUDY_VIEW.zoom);
  };

  const closeCaseStudy = () => {
    setCaseStudyOpen(false);
    setReduction(0);
    setBaselineScore(null);
    setSimulatedScore(null);
    mapRef.current?.flyTo(KL_INITIAL_VIEW.center, KL_INITIAL_VIEW.zoom);
  };

  const caseStudyZone = useMemo(
    () => floodData?.features.find((f) => f.properties.id === CASE_STUDY_ZONE_ID),
    [floodData],
  );

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" />

      {loadError && (
        <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-red-600 px-4 py-2 text-sm text-white shadow-lg">
          {loadError}
        </div>
      )}

      <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
        <div className="pointer-events-auto rounded-lg bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
          <h1 className="text-base font-semibold text-slate-900">{t("app.title")}</h1>
          <p className="text-xs text-slate-500">{t("app.subtitle")}</p>
        </div>
        <div className="pointer-events-auto">
          <LanguageSwitcher />
        </div>
      </div>

      <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={t("layer.menu")}
          aria-expanded={menuOpen}
          title={`${t("layer.menu")} (M to open)`}
          className="rounded-lg bg-white/95 px-3 py-2 text-lg leading-none shadow-lg backdrop-blur hover:bg-white"
        >
          ☰
        </button>
        {menuOpen && (
          <LayerControls
            primaryLayer={primaryLayer}
            onPrimaryLayerChange={setPrimaryLayer}
            showParking={showParking}
            onShowParkingChange={setShowParking}
            showCongestion={showCongestion}
            onShowCongestionChange={setShowCongestion}
          />
        )}
      </div>

      {!caseStudyOpen && (
        <button
          onClick={openCaseStudy}
          disabled={!mapReady}
          className="absolute bottom-6 right-4 rounded-lg bg-white/95 px-4 py-2 text-sm font-medium text-slate-800 shadow-lg backdrop-blur hover:bg-white disabled:opacity-50"
        >
          {t("caseStudy.open")}
        </button>
      )}

      {caseStudyOpen && (
        <CaseStudyPanel
          zoneName={caseStudyZone?.properties.name ?? CASE_STUDY_ZONE_ID}
          notes={caseStudyZone?.properties.notes}
          reduction={reduction}
          onReductionChange={setReduction}
          baselineScore={baselineScore}
          simulatedScore={simulatedScore}
          onClose={closeCaseStudy}
        />
      )}

      <Legend titleKey={primaryLayer === "compound" ? "legend.compoundingRisk" : "legend.floodRisk"} />

      {hoverInfo && (
        <div
          className="pointer-events-none absolute z-20 max-w-xs rounded-md bg-slate-900/95 px-3 py-2 text-xs text-white shadow-xl"
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
