import { useMemo } from "react";
import { TreePine, Camera, Satellite } from "lucide-react";
import type { Tree, GeotaggedPhoto } from "@/lib/types";
import { distanceMeters } from "@/lib/capture";

/**
 * Top-down view of everything section A has coordinates for: trees, plus photo
 * evidence, drawn to scale in metres.
 *
 * Deliberately not a tile map. A plot is tens of metres across, and at that
 * size satellite imagery shows a green smudge while the thing that matters —
 * which tree is where, and whether the evidence was shot among them — reads
 * better as a plain scatter. The "Satellite" link hands off to Google Maps for
 * the times context genuinely helps, which keeps this dependency-free and
 * working offline in the field.
 *
 * ponytail: equirectangular projection about the centroid. Exact enough below
 * a few km (sub-centimetre error at plot scale) and it is four lines. Reach for
 * a real projection only if plots ever span degrees.
 */

interface Marker {
  id: string;
  label: string;
  lat: number;
  lon: number;
  kind: "tree" | "photo";
  group: string;
}

/** Colour per treatment group, cycling. Photos get their own muted marker. */
const GROUP_COLORS = ["#22c55e", "#38bdf8", "#f59e0b", "#a78bfa", "#f472b6"];

function toMarkers(trees: Tree[], photos: GeotaggedPhoto[]): Marker[] {
  const out: Marker[] = [];
  const push = (
    id: string, label: string, lat?: string, lon?: string,
    kind: Marker["kind"] = "tree", group = ""
  ) => {
    const y = Number(lat);
    const x = Number(lon);
    // Blank reads as 0 via Number(""), which would plant the marker in the Gulf
    // of Guinea and blow out the scale for everything else.
    if (!lat || !lon || !Number.isFinite(y) || !Number.isFinite(x)) return;
    out.push({ id, label, lat: y, lon: x, kind, group });
  };
  trees.forEach((t) => push(t.id, t.TreeCode || t.id, t.Latitude, t.Longitude, "tree", t.TreatmentGroup || ""));
  photos.forEach((p) => push(p.id, p.Description || "Bukti", p.Latitude, p.Longitude, "photo"));
  return out;
}

export function PlotMap({ trees, photos }: { trees: Tree[]; photos: GeotaggedPhoto[] }) {
  const markers = useMemo(() => toMarkers(trees, photos), [trees, photos]);

  const view = useMemo(() => {
    if (markers.length === 0) return null;
    const lat0 = markers.reduce((s, m) => s + m.lat, 0) / markers.length;
    const lon0 = markers.reduce((s, m) => s + m.lon, 0) / markers.length;
    const cos = Math.cos((lat0 * Math.PI) / 180);
    // Metres east / north of the centroid. y is flipped so north draws up.
    const pts = markers.map((m) => ({
      ...m,
      x: (m.lon - lon0) * cos * 111320,
      y: -(m.lat - lat0) * 110540,
    }));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    // A single point (or a perfectly straight row) has zero extent in one axis,
    // which would divide by zero — floor the span so it still renders.
    const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 10);
    const spanY = Math.max(Math.max(...ys) - Math.min(...ys), 10);
    const pad = Math.max(spanX, spanY) * 0.15;
    return {
      pts, lat0, lon0,
      minX: Math.min(...xs) - pad, minY: Math.min(...ys) - pad,
      w: spanX + pad * 2, h: spanY + pad * 2,
      spanX, spanY,
    };
  }, [markers]);

  const groups = useMemo(
    () => Array.from(new Set(markers.filter((m) => m.kind === "tree").map((m) => m.group).filter(Boolean))),
    [markers]
  );
  const colorFor = (group: string) => GROUP_COLORS[Math.max(0, groups.indexOf(group)) % GROUP_COLORS.length];

  if (!view) {
    return (
      <p className="text-xs text-muted-foreground py-6 text-center">
        Tiada koordinat lagi — tag GPS pada pokok atau bukti foto untuk melihat pelan plot.
      </p>
    );
  }

  // Marker radius in metres, so dots stay proportionate whatever the plot size.
  const r = Math.max(view.w, view.h) * 0.012;
  // Scale bar: a round number of metres that fits comfortably across the view.
  const barM = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((n) => n > view.w / 5) ?? 500;
  const widest = Math.max(...view.pts.map((p) => distanceMeters(view.lat0, view.lon0, p.lat, p.lon)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          {groups.map((g) => (
            <span key={g} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: colorFor(g) }} /> {g}
            </span>
          ))}
          {photos.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Camera className="h-3 w-3 text-muted-foreground" /> Bukti foto
            </span>
          )}
        </div>
        <a
          href={`https://www.google.com/maps/@${view.lat0.toFixed(6)},${view.lon0.toFixed(6)},150m/data=!3m1!1e3`}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 text-[11px] text-primary hover:underline"
        >
          <Satellite className="h-3 w-3" /> Imej satelit
        </a>
      </div>

      <svg
        viewBox={`${view.minX} ${view.minY} ${view.w} ${view.h}`}
        className="w-full rounded-lg border border-border bg-muted/30"
        style={{ aspectRatio: `${view.w} / ${view.h}` }}
        role="img"
        aria-label={`Pelan plot: ${view.pts.length} titik berkoordinat`}
      >
        {view.pts.map((p) => (
          <g key={`${p.kind}-${p.id}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={p.kind === "photo" ? r * 0.7 : r}
              fill={p.kind === "photo" ? "none" : colorFor(p.group)}
              stroke={p.kind === "photo" ? "currentColor" : "none"}
              strokeWidth={r * 0.3}
              className={p.kind === "photo" ? "text-muted-foreground" : ""}
            />
            <title>{`${p.label} · ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`}</title>
          </g>
        ))}

        {/* Scale bar, bottom-left, in real metres. */}
        <g stroke="currentColor" className="text-muted-foreground" strokeWidth={r * 0.2}>
          <line
            x1={view.minX + view.w * 0.05}
            y1={view.minY + view.h * 0.93}
            x2={view.minX + view.w * 0.05 + barM}
            y2={view.minY + view.h * 0.93}
          />
        </g>
        <text
          x={view.minX + view.w * 0.05}
          y={view.minY + view.h * 0.9}
          fontSize={r * 1.6}
          fill="currentColor"
          className="text-muted-foreground"
        >
          {barM} m
        </text>
        <text
          x={view.minX + view.w * 0.95}
          y={view.minY + view.h * 0.08}
          fontSize={r * 1.6}
          textAnchor="end"
          fill="currentColor"
          className="text-muted-foreground"
        >
          ↑ U
        </text>
      </svg>

      <p className="text-[11px] text-muted-foreground">
        <TreePine className="inline h-3 w-3 text-primary mr-1" />
        {view.pts.filter((p) => p.kind === "tree").length} pokok berkoordinat ·{" "}
        {view.pts.filter((p) => p.kind === "photo").length} bukti foto · lebar plot ~{view.spanX.toFixed(0)} m ×{" "}
        {view.spanY.toFixed(0)} m · titik terjauh {widest.toFixed(0)} m dari tengah
      </p>
    </div>
  );
}
