import { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Embedded interactive map (Leaflet + OpenStreetMap). Free and open-source —
 * no API key, no billing. Renders colored dots for anything that carries a
 * coordinate (trees, evidence photos, application sites…). Tiles come from
 * OSM, so it needs network; the SVG PlotMap stays as the offline fallback.
 *
 * ponytail: CircleMarker (vector dots) not L.marker — dodges Leaflet's default
 * icon-asset breakage under Vite and keeps it CSP-clean (no external images).
 */

/** What a point represents — drives the glyph shape on the Pelan (SVG) plan. */
export type MapPointKind = "tree" | "scan" | "photo" | "application" | "soil" | "observation";

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  /** Fill colour; defaults to the primary green. */
  color?: string;
  /** Outline-only marker (e.g. photo evidence) vs filled (e.g. a tree). */
  hollow?: boolean;
  /** Category, used by the Pelan plan to pick a distinct glyph. */
  kind?: MapPointKind;
  /** Treatment group name (trees only), for the Pelan legend. */
  group?: string;
}

/** Pan/zoom to fit all points whenever they change. */
function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useMemo(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 18);
      return;
    }
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    map.fitBounds(
      [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
      { padding: [30, 30], maxZoom: 19 }
    );
  }, [points, map]);
  return null;
}

export function MapView({
  points,
  height = 340,
  className = "",
}: {
  points: MapPoint[];
  height?: number;
  className?: string;
}) {
  const center = points[0]
    ? ([points[0].lat, points[0].lng] as [number, number])
    : ([3.139, 101.6869] as [number, number]); // KL fallback when nothing to show yet

  return (
    <div className={`overflow-hidden rounded-lg border border-border ${className}`} style={{ height }}>
      <MapContainer center={center} zoom={16} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <FitBounds points={points} />
        {points.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={7}
            pathOptions={{
              color: p.color ?? "#22c55e",
              weight: 2,
              fillColor: p.color ?? "#22c55e",
              fillOpacity: p.hollow ? 0 : 0.75,
            }}
          >
            <Tooltip>
              {p.label}
              <span className="block font-mono text-[10px] opacity-70">
                {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
              </span>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
