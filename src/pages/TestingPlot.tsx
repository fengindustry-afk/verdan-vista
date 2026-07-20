import { BentoCard } from "@/components/BentoCard";
import {
  useTrees, useReadings, useSoilSamples, usePlotObservations, usePlotApplications,
  usePlotComparisons, useUpsert,
} from "@/hooks/useCollection";
import { TreePine, Loader2, Plus, Pencil, User, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EditTreeDialog } from "@/components/capture/EditTreeDialog";
import { EditSoilSampleDialog } from "@/components/capture/EditSoilSampleDialog";
import { EditObservationDialog } from "@/components/capture/EditObservationDialog";
import { EditApplicationDialog } from "@/components/capture/EditApplicationDialog";
import { TestingPlotSummary } from "@/components/TestingPlotSummary";
import { PairTable } from "@/components/testing-plot/PairTable";
import { soilPercentChange, summarizeTestingPlot, SUMMARY_PARAMS } from "@/lib/testingPlotSummary";
import {
  PLOT_SECTIONS, GROWTH_COLUMNS, HEALTH_COLUMNS, YIELD_COLUMNS,
  buildSectionRows, groupReadingsByTree, type PlotSectionDef,
} from "@/lib/testingPlotSections";
import type { SoilSample, PlotObservation, PlotApplication, PlotComparison } from "@/lib/types";
import { Collections } from "@/lib/collections";
import { fmt } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { hasPermission, Permission } from "@/lib/rbac";

export default function TestingPlot() {
  const { data: trees = [], isLoading } = useTrees();
  const { data: readings = [] } = useReadings();
  const { data: soilSamples = [] } = useSoilSamples();
  const { data: observations = [] } = usePlotObservations();
  const { data: applications = [] } = usePlotApplications();
  const { data: comparisons = [] } = usePlotComparisons();
  const { role } = useAuth();
  const canEdit = hasPermission(role, Permission.AddLocations);
  const [searchParams] = useSearchParams();
  const initialSection = searchParams.get("section") || "summary";

  const readingsByTree = useMemo(() => groupReadingsByTree(readings), [readings]);
  const treatmentGroups = useMemo(
    () => Array.from(new Set(trees.map((t) => t.TreatmentGroup?.trim()).filter((g): g is string => !!g))),
    [trees]
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Memuatkan…
      </div>
    );
  }

  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-72 h-72 -top-36 right-10 animate-pulse-glow" />
      <div>
        <h1 className="text-2xl font-bold text-foreground">Testing Plot</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ujian lapangan biochar — mengikut struktur buku kerja ESTERRA Plot 5 (Seksyen A–H)
        </p>
      </div>

      <Tabs defaultValue={initialSection}>
        <TabsList className="flex w-full overflow-x-auto justify-start">
          <TabsTrigger value="summary">Ringkasan</TabsTrigger>
          {PLOT_SECTIONS.map((s) => (
            <TabsTrigger key={s.key} value={s.key} className="whitespace-nowrap">
              <s.icon className="h-3.5 w-3.5 mr-1" /> {s.letter}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="summary" className="pt-4">
          <TestingPlotSummary trees={trees} readings={readings} soilSamples={soilSamples} applications={applications} />
        </TabsContent>

        <TabsContent value="A" className="pt-4 space-y-4">
          <SectionHeader def={PLOT_SECTIONS[0]} action={canEdit ? <EditTreeDialog /> : undefined} />
          <SectionA trees={trees} readingsByTree={readingsByTree} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="B" className="pt-4 space-y-4">
          <SectionHeader def={PLOT_SECTIONS[1]} />
          <PairTable rows={buildSectionRows(trees, readingsByTree, GROWTH_COLUMNS)} columns={GROWTH_COLUMNS} />
          <p className="text-[11px] text-muted-foreground">Nilai direkod per pokok — buka pokok untuk menambah bacaan baharu.</p>
        </TabsContent>

        <TabsContent value="C" className="pt-4 space-y-4">
          <SectionHeader def={PLOT_SECTIONS[2]} />
          <PairTable rows={buildSectionRows(trees, readingsByTree, HEALTH_COLUMNS)} columns={HEALTH_COLUMNS} />
        </TabsContent>

        <TabsContent value="D" className="pt-4 space-y-4">
          <SectionHeader def={PLOT_SECTIONS[3]} />
          <PairTable rows={buildSectionRows(trees, readingsByTree, YIELD_COLUMNS)} columns={YIELD_COLUMNS} />
        </TabsContent>

        <TabsContent value="E" className="pt-4 space-y-4">
          <SectionE soilSamples={soilSamples} groups={treatmentGroups} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="F" className="pt-4 space-y-4">
          <SectionF observations={observations} groups={treatmentGroups} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="G" className="pt-4 space-y-4">
          <SectionHeader def={PLOT_SECTIONS[6]} />
          <SectionG trees={trees} readings={readings} comparisons={comparisons} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="H" className="pt-4 space-y-4">
          <SectionH applications={applications} canEdit={canEdit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SectionHeader({ def, action }: { def: PlotSectionDef; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <def.icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Seksyen {def.letter} — {def.titleBm}</h2>
          <p className="text-[11px] text-muted-foreground">{def.title}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

/* ── Section A — Plot Information (trees, grouped by treatment) ─────────────── */
function SectionA({
  trees, readingsByTree, canEdit,
}: {
  trees: import("@/lib/types").Tree[];
  readingsByTree: Map<string, import("@/lib/types").TreeReading[]>;
  canEdit: boolean;
}) {
  const groups = useMemo(() => {
    const byGroup = new Map<string, typeof trees>();
    trees.forEach((t) => {
      const g = t.TreatmentGroup || "Ungrouped";
      byGroup.set(g, [...(byGroup.get(g) ?? []), t]);
    });
    return Array.from(byGroup.entries());
  }, [trees]);

  if (trees.length === 0) return <p className="text-sm text-muted-foreground py-10 text-center">No trees recorded.</p>;

  return (
    <div className="space-y-5">
      {groups.map(([group, groupTrees]) => (
        <div key={group} className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group} · {groupTrees.length} trees
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {groupTrees.map((t, i) => (
              <BentoCard key={t.id} delay={i * 0.03} className="relative h-full cursor-pointer group">
                <Link to={`/testing-plot/${encodeURIComponent(t.id)}`} aria-label={`View ${t.TreeCode}`} className="absolute inset-0 z-0 rounded-[inherit]" />
                <div className="relative z-10 pointer-events-none">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 group-hover:text-primary transition-colors">
                      <TreePine className="h-3.5 w-3.5 text-primary" /> {t.TreeCode}
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">{readingsByTree.get(t.id)?.length ?? 0} readings</Badge>
                      {canEdit && <span className="pointer-events-auto"><EditTreeDialog tree={t} /></span>}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{t.Species}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{t.PlotName} · {t.CropAge}</p>
                  {t.Treatment && t.Treatment !== "None" && (
                    <p className="text-[11px] text-cyan-400 mt-1">Treatment: {t.Treatment}</p>
                  )}
                </div>
              </BentoCard>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Section E — Soil Analysis ─────────────────────────────────────────────── */
function SectionE({
  soilSamples, groups, canEdit,
}: {
  soilSamples: SoilSample[];
  groups: string[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<SoilSample | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <SectionHeader
        def={PLOT_SECTIONS[4]}
        action={canEdit ? (
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-md border border-primary/40 text-primary px-2 py-1 text-xs font-medium hover:bg-primary/10 transition-colors">
            <Plus className="h-3 w-3" /> Tambah sampel
          </button>
        ) : undefined}
      />
      {soilSamples.length === 0 ? (
        <p className="text-xs text-muted-foreground">Tiada sampel tanah direkodkan.{canEdit && " Tambah satu untuk memasukkan metrik tanah ke dalam ringkasan."}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/50">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 bg-muted/40 text-muted-foreground">
                {["Bil pokok", "ID pokok", "Kumpulan", "Parameter", "Bacaan awal", "Bacaan akhir", "Perubahan (%)"].map((h) => (
                  <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {soilSamples.map((s) => {
                const pct = soilPercentChange(s);
                return (
                  <tr
                    key={s.id}
                    onClick={() => canEdit && setEditing(s)}
                    className={`border-b border-border/30 hover:bg-muted/20 ${canEdit ? "cursor-pointer" : ""}`}
                  >
                    <td className="px-3 py-2 tabular-nums">{s.TreeNo ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-foreground">{s.TreeId ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {s.TreatmentGroup ? <Badge variant="outline" className="text-[10px]">{s.TreatmentGroup}</Badge> : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-foreground">{s.Parameter}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.InitialReading ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.FinalReading ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {pct === null ? <span className="text-muted-foreground/50">—</span> : (
                        <span className={pct >= 0 ? "text-primary" : "text-destructive"}>{pct > 0 ? "+" : ""}{fmt(pct, 1)}%</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && (
        <>
          <EditSoilSampleDialog groups={groups} open={adding} onOpenChange={setAdding} />
          <EditSoilSampleDialog key={editing?.id ?? "none"} sample={editing ?? undefined} groups={groups} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
        </>
      )}
    </>
  );
}

/* ── Section F — Visual Observation ────────────────────────────────────────── */
function SectionF({
  observations, groups, canEdit,
}: {
  observations: PlotObservation[];
  groups: string[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<PlotObservation | null>(null);
  const [adding, setAdding] = useState(false);
  const sorted = useMemo(
    () => [...observations].sort((a, b) => (b.Date ?? "").localeCompare(a.Date ?? "")),
    [observations]
  );
  return (
    <>
      <SectionHeader
        def={PLOT_SECTIONS[5]}
        action={canEdit ? (
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-md border border-primary/40 text-primary px-2 py-1 text-xs font-medium hover:bg-primary/10 transition-colors">
            <Plus className="h-3 w-3" /> Tambah pemerhatian
          </button>
        ) : undefined}
      />
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">Tiada pemerhatian direkodkan.{canEdit && " Tambah catatan lapangan bertarikh yang pertama."}</p>
      ) : (
        <div className="space-y-3">
          {sorted.map((o) => (
            <BentoCard key={o.id} className="!p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Calendar className="h-3 w-3" /> {o.Date ?? "—"}
                    {o.TreatmentGroup && <Badge variant="outline" className="text-[10px]">{o.TreatmentGroup}</Badge>}
                  </div>
                  <Field label="Keadaan daun" value={o.LeafCondition} />
                  <Field label="Keadaan batang" value={o.StemCondition} />
                  <Field label="Keadaan tanah" value={o.SoilCondition} />
                  {o.Notes && <Field label="Catatan" value={o.Notes} />}
                  {o.RecordedBy && <p className="text-[10px] text-muted-foreground flex items-center gap-1 pt-0.5"><User className="h-2.5 w-2.5" /> {o.RecordedBy}</p>}
                </div>
                {canEdit && (
                  <button onClick={() => setEditing(o)} className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" aria-label="Kemas kini pemerhatian">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </BentoCard>
          ))}
        </div>
      )}
      {canEdit && (
        <>
          <EditObservationDialog groups={groups} open={adding} onOpenChange={setAdding} />
          <EditObservationDialog key={editing?.id ?? "none"} observation={editing ?? undefined} groups={groups} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
        </>
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <p className="text-xs text-foreground">
      <span className="text-muted-foreground">{label}: </span>{value}
    </p>
  );
}

/* ── Section G — Biochar vs Non-Biochar (computed comparison) ──────────────── */
/** A group counts as biochar unless its name says otherwise (control / tanpa / non / without). */
const isNonBiochar = (g: string) => /control|kawalan|tanpa|non[- ]?biochar|without/i.test(g);

function SectionG({
  trees, readings, comparisons, canEdit,
}: {
  trees: import("@/lib/types").Tree[];
  readings: import("@/lib/types").TreeReading[];
  comparisons: PlotComparison[];
  canEdit: boolean;
}) {
  const upsert = useUpsert<PlotComparison>(Collections.plotComparisons, { surfaceErrors: true });
  const thisMonth = new Date().toISOString().slice(0, 7);

  // Every month that has either a reading or a saved comparison, newest last.
  const months = useMemo(() => {
    const set = new Set<string>([thisMonth]);
    for (const r of readings) if (r.Date) set.add(r.Date.slice(0, 7));
    for (const c of comparisons) if (c.Date) set.add(c.Date.slice(0, 7));
    return Array.from(set).sort();
  }, [readings, comparisons, thisMonth]);

  const [month, setMonth] = useState(months[months.length - 1] ?? thisMonth);
  const cropType = trees.find((t) => t.Species)?.Species ?? "—";

  /**
   * Computed side-averages as of the END of a given month: only readings up to
   * that month feed the baseline→latest change, so each month is a real snapshot
   * rather than the whole trial repeated.
   */
  const computedFor = useMemo(() => {
    const cache = new Map<string, Map<string, [number | null, number | null]>>();
    return (m: string, paramKey: string): [number | null, number | null] => {
      let byParam = cache.get(m);
      if (!byParam) {
        const upTo = readings.filter((r) => (r.Date ?? "").slice(0, 7) <= m);
        const summaries = summarizeTestingPlot(trees, upTo);
        byParam = new Map();
        for (const p of SUMMARY_PARAMS) {
          const side = (nonBiochar: boolean) => {
            const vals = summaries
              .filter((sm) => isNonBiochar(sm.group) === nonBiochar)
              .map((sm) => sm.results.find((r) => r.param.key === p.key)?.percent)
              .filter((v): v is number => v != null);
            return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
          };
          byParam.set(p.key as string, [side(true), side(false)]);
        }
        cache.set(m, byParam);
      }
      return byParam.get(paramKey) ?? [null, null];
    };
  }, [trees, readings]);

  const overrideFor = (m: string, key: string) =>
    comparisons.find((c) => c.Parameter === key && (c.Date ?? "").slice(0, 7) === m);

  /** Effective values for a month: manual override wins, else the computed snapshot. */
  const valuesFor = (m: string, key: string) => {
    const [cNon, cBio] = computedFor(m, key);
    const o = overrideFor(m, key);
    const non = o?.NonBiocharPct ?? cNon;
    const bio = o?.BiocharPct ?? cBio;
    return { o, non, bio, improvement: non != null && bio != null ? bio - non : null };
  };

  const saveOverride = (key: string, field: "NonBiocharPct" | "BiocharPct", raw: string) => {
    const existing = overrideFor(month, key);
    const value = raw === "" ? null : Number(raw);
    if (existing && existing[field] === value) return;
    void upsert.mutateAsync({
      ...existing,
      id: existing?.id ?? `cmp_${month}_${key}`,
      Parameter: key,
      Date: `${month}-01`,
      [field]: value,
    } as PlotComparison).catch(() => null); // useUpsert toasts the failure
  };

  if (readings.length < 1 && comparisons.length < 1)
    return <p className="text-sm text-muted-foreground py-8 text-center">Data tidak mencukupi untuk perbandingan.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">Bulan</label>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
        >
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/50">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 bg-muted/40 text-muted-foreground">
              {["Parameter", "Jenis tanaman", "Non-Biochar (%)", "Biochar (%)", "Improvement (%)"].map((h) => (
                <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SUMMARY_PARAMS.map((p) => {
              const key = p.key as string;
              const { o, non, bio, improvement } = valuesFor(month, key);
              return (
                <tr key={key} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="px-3 py-2 text-muted-foreground">{p.label}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{o?.CropType || cropType}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Cell canEdit={canEdit} value={non} manual={o?.NonBiocharPct != null} onSave={(v) => saveOverride(key, "NonBiocharPct", v)} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Cell canEdit={canEdit} value={bio} manual={o?.BiocharPct != null} onSave={(v) => saveOverride(key, "BiocharPct", v)} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold"><Pct value={improvement} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-3 py-2 text-[11px] text-muted-foreground">
          Nilai dikira daripada bacaan Seksyen B–D sehingga hujung bulan {month}.
          {canEdit && " Klik sel untuk menulis ganti secara manual (kosongkan untuk kembali kepada nilai dikira)."}
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Progresi bulanan — Improvement (%)
        </h3>
        <div className="overflow-x-auto rounded-xl border border-border/50">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 bg-muted/40 text-muted-foreground">
                <th className="text-left font-medium px-3 py-2 whitespace-nowrap">Parameter</th>
                {months.map((m) => (
                  <th key={m} className="text-right font-medium px-3 py-2 whitespace-nowrap">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SUMMARY_PARAMS.map((p) => (
                <tr key={p.key as string} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{p.label}</td>
                  {months.map((m) => (
                    <td key={m} className="px-3 py-2 text-right tabular-nums">
                      <Pct value={valuesFor(m, p.key as string).improvement} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** A percentage cell: computed by default, editable in place when allowed. */
function Cell({
  value, manual, canEdit, onSave,
}: {
  value: number | null;
  manual: boolean;
  canEdit: boolean;
  onSave: (raw: string) => void;
}) {
  if (!canEdit) return <><Pct value={value} />{manual && <span className="text-muted-foreground"> •</span>}</>;
  return (
    <input
      type="number"
      step="0.1"
      defaultValue={value == null ? "" : Number(value.toFixed(1))}
      key={`${manual}-${value ?? ""}`}
      onBlur={(e) => onSave(e.target.value)}
      placeholder="—"
      title={manual ? "Nilai manual" : "Nilai dikira — taip untuk menulis ganti"}
      className={`w-20 rounded-md border bg-transparent px-1.5 py-0.5 text-right tabular-nums ${
        manual ? "border-primary/50 text-foreground" : "border-transparent text-muted-foreground hover:border-border"
      }`}
    />
  );
}

function Pct({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground/50">—</span>;
  return <span className={value >= 0 ? "text-primary" : "text-destructive"}>{value > 0 ? "+" : ""}{fmt(value, 1)}%</span>;
}

/* ── Section H — Product Application Record ─────────────────────────────────── */
function SectionH({ applications, canEdit }: { applications: PlotApplication[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<PlotApplication | null>(null);
  const [adding, setAdding] = useState(false);
  const sorted = useMemo(
    () => [...applications].sort((a, b) => (b.Date ?? "").localeCompare(a.Date ?? "")),
    [applications]
  );
  const totalKg = (a: PlotApplication) =>
    a.RatePerTreeKg != null && a.TreeCount != null ? a.RatePerTreeKg * a.TreeCount : null;
  const totalCost = (a: PlotApplication) => {
    const kg = totalKg(a);
    return kg != null && a.UnitPrice != null ? kg * a.UnitPrice : null;
  };

  return (
    <>
      <SectionHeader
        def={PLOT_SECTIONS[7]}
        action={canEdit ? (
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-md border border-primary/40 text-primary px-2 py-1 text-xs font-medium hover:bg-primary/10 transition-colors">
            <Plus className="h-3 w-3" /> Tambah aplikasi
          </button>
        ) : undefined}
      />
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">Tiada aplikasi produk direkodkan.{canEdit && " Rekod aplikasi biochar/baja yang pertama."}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/50">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 bg-muted/40 text-muted-foreground">
                {["Tarikh", "Produk", "Kadar (kg/pokok)", "Bilangan pokok", "Total kadar (kg)", "Harga (RM/kg)", "Total cost (RM)", "Kaedah", "Pegawai", "Supervisor", ""].map((h) => (
                  <th key={h} className="text-left font-medium px-3 py-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.id} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="px-3 py-2 whitespace-nowrap">{a.Date ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-foreground">{a.Product ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.RatePerTreeKg ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.TreeCount ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totalKg(a) != null ? fmt(totalKg(a)!, 1) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.UnitPrice ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{totalCost(a) != null ? fmt(totalCost(a)!, 2) : "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{a.Method ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{a.Officer ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{a.Supervisor ?? "—"}</td>
                  <td className="px-3 py-2">
                    {canEdit && (
                      <button onClick={() => setEditing(a)} className="rounded-md p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" aria-label="Kemas kini aplikasi">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && (
        <>
          <EditApplicationDialog open={adding} onOpenChange={setAdding} />
          <EditApplicationDialog key={editing?.id ?? "none"} application={editing ?? undefined} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
        </>
      )}
    </>
  );
}
