import { useMemo } from "react";
import { TreePine } from "lucide-react";
import type { MapPoint, MapPointKind } from "@/components/map/MapView";
import { distanceMeters } from "@/lib/capture";

/**
 * Top-down "Pelan plot" — every coordinate on the plot drawn to scale in
 * metres. Deliberately not a tile map: a plot is tens of metres across, where
 * satellite imagery is a green smudge but the arrangement of trees, scans and
 * evidence reads far better as a clean schematic. The "Peta" toggle hands off
 * to the real OSM map for geographic context.
 *
 * Colour encodes treatment group (trees); shape encodes record type, so a
 * single glance separates a soil sample from a scan from a photo.
 *
 * ponytail: equirectangular projection about the centroid — sub-centimetre
 * error at plot scale, four lines. A real projection only earns its keep if a
 * plot ever spans degrees.
 */

/** Malay labels for the record types, for the legend. */
const KIND_LABELS: Record<MapPointKind, string> = {
  tree: "Pokok",
  scan: "Imbasan",
  photo: "Bukti foto",
  application: "Aplikasi",
  soil: "Sampel tanah",
  observation: "Pemerhatian",
};

interface PlotPoint extends MapPoint {
  x: number;
  y: number;
}

/** A record-type glyph centred at (cx, cy), radius r, drawn in metre-space. */
function Glyph({ p, r }: { p: PlotPoint; r: number }) {
  const color = p.color ?? "#22c55e";
  const kind = p.kind ?? "tree";
  const common = { className: "pm-marker" as const };
  switch (kind) {
    case "photo":
      return <circle {...common} cx={p.x} cy={p.y} r={r * 0.85} fill="none" stroke={color} strokeWidth={r * 0.34} />;
    case "scan": // filled dot with a light aperture centre (camera)
      return (
        <g {...common}>
          <circle cx={p.x} cy={p.y} r={r} fill={color} />
          <circle cx={p.x} cy={p.y} r={r * 0.36} className="fill-background" />
        </g>
      );
    case "application": // diamond
      return (
        <path {...common} fill={color}
          d={`M ${p.x} ${p.y - r * 1.3} L ${p.x + r * 1.3} ${p.y} L ${p.x} ${p.y + r * 1.3} L ${p.x - r * 1.3} ${p.y} Z`} />
      );
    case "soil": // square
      return <rect {...common} x={p.x - r} y={p.y - r} width={r * 2} height={r * 2} rx={r * 0.28} fill={color} />;
    case "observation": // hollow triangle
      return (
        <path {...common} fill="none" stroke={color} strokeWidth={r * 0.34} strokeLinejoin="round"
          d={`M ${p.x} ${p.y - r * 1.25} L ${p.x + r * 1.15} ${p.y + r * 0.95} L ${p.x - r * 1.15} ${p.y + r * 0.95} Z`} />
      );
    default: // tree — filled dot, colour = treatment group
      return <circle {...common} cx={p.x} cy={p.y} r={r} fill={color} />;
  }
}

/** A small fixed-size glyph for the legend (12×12 viewBox). */
function LegendGlyph({ kind, color }: { kind: MapPointKind; color: string }) {
  const p = { id: "", label: "", lat: 0, lng: 0, x: 6, y: 6, kind, color } as PlotPoint;
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden className="shrink-0 overflow-visible">
      <Glyph p={p} r={4} />
    </svg>
  );
}

export function PlotMap({ points }: { points: MapPoint[] }) {
  const view = useMemo(() => {
    if (points.length === 0) return null;
    const lat0 = points.reduce((s, m) => s + m.lat, 0) / points.length;
    const lon0 = points.reduce((s, m) => s + m.lng, 0) / points.length;
    const cos = Math.cos((lat0 * Math.PI) / 180);
    // Metres east / north of the centroid; y flipped so north draws up.
    const pts: PlotPoint[] = points.map((m) => ({
      ...m,
      x: (m.lng - lon0) * cos * 111320,
      y: -(m.lat - lat0) * 110540,
    }));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    // A single point (or a straight row) has zero extent in one axis — floor
    // the span so it still renders instead of dividing by zero.
    const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 10);
    const spanY = Math.max(Math.max(...ys) - Math.min(...ys), 10);
    const pad = Math.max(spanX, spanY) * 0.16;
    return {
      pts, lat0, lon0,
      minX: Math.min(...xs) - pad, minY: Math.min(...ys) - pad,
      w: spanX + pad * 2, h: spanY + pad * 2,
      spanX, spanY,
    };
  }, [points]);

  // Treatment groups (trees) → colour, in first-seen order, for the legend.
  const groups = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of points) if (p.kind === "tree" && p.group && !m.has(p.group)) m.set(p.group, p.color ?? "#22c55e");
    return [...m.entries()];
  }, [points]);

  // Record types present (excluding plain trees, which the group swatches cover).
  const layers = useMemo(() => {
    const m = new Map<MapPointKind, string>();
    for (const p of points) {
      const k = p.kind ?? "tree";
      if (k !== "tree" && !m.has(k)) m.set(k, p.color ?? "#22c55e");
    }
    return [...m.entries()];
  }, [points]);

  if (!view) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 py-10 text-center">
        <TreePine className="h-6 w-6 text-muted-foreground/60" />
        <p className="max-w-xs text-xs text-muted-foreground">
          Tiada koordinat lagi. Tag GPS pada pokok, imbasan atau bukti foto untuk melihat pelan plot.
        </p>
      </div>
    );
  }

  // Marker radius in metres, so dots stay proportionate whatever the plot size.
  const r = Math.max(view.w, view.h) * 0.013;
  // Round grid + scale interval that fits a handful of divisions across.
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((n) => n > view.w / 6) ?? 500;
  const widest = Math.max(...view.pts.map((p) => distanceMeters(view.lat0, view.lon0, p.lat, p.lng)));

  // Grid lines snapped to `step`, spanning the padded view.
  const gridXs: number[] = [];
  for (let x = Math.ceil(view.minX / step) * step; x < view.minX + view.w; x += step) gridXs.push(x);
  const gridYs: number[] = [];
  for (let y = Math.ceil(view.minY / step) * step; y < view.minY + view.h; y += step) gridYs.push(y);

  const treeCount = view.pts.filter((p) => (p.kind ?? "tree") === "tree").length;

  return (
    <div className="space-y-3">
      {/* Legend — colour = treatment group, shape = record type. */}
      {(groups.length > 0 || layers.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
          {groups.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="font-medium text-muted-foreground/80">Kumpulan</span>
              {groups.map(([g, color]) => (
                <span key={g} className="inline-flex items-center gap-1.5 text-foreground">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} /> {g}
                </span>
              ))}
            </div>
          )}
          {layers.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {groups.length > 0 && <span className="hidden h-3 w-px bg-border sm:inline-block" />}
              <span className="font-medium text-muted-foreground/80">Jenis</span>
              {layers.map(([kind, color]) => (
                <span key={kind} className="inline-flex items-center gap-1.5 text-foreground">
                  <LegendGlyph kind={kind} color={color} /> {KIND_LABELS[kind]}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <svg
        viewBox={`${view.minX} ${view.minY} ${view.w} ${view.h}`}
        className="w-full rounded-xl border border-border bg-[radial-gradient(circle_at_50%_-20%,hsl(var(--muted)/0.5),hsl(var(--muted)/0.15))]"
        style={{ aspectRatio: `${view.w} / ${view.h}` }}
        role="img"
        aria-label={`Pelan plot: ${view.pts.length} titik berkoordinat merentasi ${view.spanX.toFixed(0)} kali ${view.spanY.toFixed(0)} meter`}
      >
        <style>{`
          .pm-marker { transition: transform .12s ease; transform-box: fill-box; transform-origin: center; cursor: default; }
          .pm-marker:hover { transform: scale(1.7); }
          @media (prefers-reduced-motion: reduce) { .pm-marker { transition: none; } }
        `}</style>

        {/* Metre grid — quiet spatial reference. */}
        <g className="stroke-border" strokeWidth={r * 0.08} opacity={0.5}>
          {gridXs.map((x) => <line key={`vx${x}`} x1={x} y1={view.minY} x2={x} y2={view.minY + view.h} />)}
          {gridYs.map((y) => <line key={`hy${y}`} x1={view.minX} y1={y} x2={view.minX + view.w} y2={y} />)}
        </g>

        {/* Markers, evidence under trees so the plot's structure stays legible. */}
        {[...view.pts]
          .sort((a, b) => ((a.kind ?? "tree") === "tree" ? 1 : 0) - ((b.kind ?? "tree") === "tree" ? 1 : 0))
          .map((p) => (
            <g key={`${p.kind ?? "tree"}-${p.id}`}>
              <Glyph p={p} r={r} />
              <title>{`${p.label} · ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`}</title>
            </g>
          ))}

        {/* Scale bar, bottom-left, in real metres. */}
        <g className="text-muted-foreground">
          <line
            x1={view.minX + view.w * 0.05} y1={view.minY + view.h * 0.94}
            x2={view.minX + view.w * 0.05 + step} y2={view.minY + view.h * 0.94}
            stroke="currentColor" strokeWidth={r * 0.22} strokeLinecap="round"
          />
          <text
            x={view.minX + view.w * 0.05} y={view.minY + view.h * 0.905}
            fontSize={r * 1.5} fill="currentColor"
          >
            {step} m
          </text>
        </g>

        {/* North arrow, top-right. */}
        <g className="text-muted-foreground" transform={`translate(${view.minX + view.w * 0.94} ${view.minY + view.h * 0.06})`}>
          <path d={`M 0 ${-r * 1.6} L ${r * 0.7} ${r * 0.9} L 0 ${r * 0.35} L ${-r * 0.7} ${r * 0.9} Z`} fill="currentColor" />
          <text x={0} y={-r * 2.1} fontSize={r * 1.5} fill="currentColor" textAnchor="middle">U</text>
        </g>
      </svg>

      <p className="text-[11px] text-muted-foreground">
        <TreePine className="mr-1 inline h-3 w-3 text-primary" />
        {treeCount} pokok · {view.pts.length - treeCount} rekod bukti · lebar plot ~{view.spanX.toFixed(0)} m × {view.spanY.toFixed(0)} m · titik terjauh {widest.toFixed(0)} m dari tengah
      </p>
    </div>
  );
}
