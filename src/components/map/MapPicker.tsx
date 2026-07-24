import { useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair } from "lucide-react";

/**
 * Pick a coordinate on a real map (Leaflet + OpenStreetMap). Click anywhere or
 * drag the pin to set it; "Use my location" reads the device GPS. Emits decimal
 * lat/lng strings so it drops straight into the existing string-typed coordinate
 * fields. Free/open-source, no API key.
 *
 * ponytail: a divIcon pin (inline SVG) rather than Leaflet's default marker
 * image — no bundler icon-asset dance, nothing loaded off a CDN.
 */

const PIN = L.divIcon({
  className: "",
  html: `<svg width="26" height="26" viewBox="0 0 24 24" fill="#22c55e" stroke="#052e16" stroke-width="1.5"
           style="filter:drop-shadow(0 1px 1px rgba(0,0,0,.4))">
      <path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z"/>
      <circle cx="12" cy="10" r="2.5" fill="#052e16" stroke="none"/>
    </svg>`,
  iconSize: [26, 26],
  iconAnchor: [13, 24],
});

function ClickToSet({ onSet }: { onSet: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onSet(e.latlng.lat, e.latlng.lng) });
  return null;
}

export function MapPicker({
  lat,
  lng,
  onChange,
  height = 260,
}: {
  /** Current value as strings (may be empty). */
  lat?: string;
  lng?: string;
  onChange: (lat: string, lng: string) => void;
  height?: number;
}) {
  const initial = useMemo<[number, number]>(() => {
    const y = Number(lat);
    const x = Number(lng);
    return Number.isFinite(y) && Number.isFinite(x) && (y || x) ? [y, x] : [3.139, 101.6869];
  }, [lat, lng]);

  const [pos, setPos] = useState<[number, number] | null>(
    Number(lat) || Number(lng) ? initial : null
  );
  const [locating, setLocating] = useState(false);

  const set = (y: number, x: number) => {
    setPos([y, x]);
    onChange(y.toFixed(6), x.toFixed(6));
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { set(p.coords.latitude, p.coords.longitude); setLocating(false); },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-1.5">
      <div className="overflow-hidden rounded-lg border border-border" style={{ height }}>
        <MapContainer center={initial} zoom={pos ? 18 : 13} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <ClickToSet onSet={set} />
          {pos && (
            <Marker
              position={pos}
              icon={PIN}
              draggable
              eventHandlers={{ dragend: (e) => { const m = e.target.getLatLng(); set(m.lat, m.lng); } }}
            />
          )}
        </MapContainer>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] text-muted-foreground truncate">
          {pos ? `${pos[0].toFixed(6)}, ${pos[1].toFixed(6)}` : "Tap the map to drop a pin"}
        </p>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-60"
        >
          <Crosshair className="h-3 w-3" /> {locating ? "Locating…" : "Use my location"}
        </button>
      </div>
    </div>
  );
}
