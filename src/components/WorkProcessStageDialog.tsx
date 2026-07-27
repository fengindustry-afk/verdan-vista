import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus, Loader2, ArrowLeft, ArrowUp, ChevronRight, ChevronDown, Search,
  Folder, FileText, Pencil, LayoutGrid, Rows3, X, History, Eye, Trash2, ExternalLink,
  LocateFixed, ShieldCheck, ShieldAlert,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDelete, useFeedstock, useKnownBatchIds, useLocations, useUpsert, useWorkProcessEntries, useZones } from "@/hooks/useCollection";
import { expectedGradeAYieldKg, feedstockForEntry, type ReactorModel } from "@/lib/feedstock";
import { amountFieldForStage, ZERO_OK_SUFFIX } from "@/lib/massBalance";
import {
  getCurrentPosition, geofenceCheck, formatMeters, accuracyMeters, GEOFENCE_RADIUS_M,
} from "@/lib/capture";
import type { LocationData } from "@/lib/types";
import { Collections } from "@/lib/collections";
import { useAuth } from "@/lib/auth";
import { hasPermission, Permission, UserRole } from "@/lib/rbac";
import {
  type WorkflowStageDef, type WorkProcessEntry, type FormField,
  stageFields, entryTitle, entrySubtitle, formatEntryTimestamp, phases, COORDS_SUFFIX, DEFAULT_ZONES,
  TRAIL, trailStraightLineKm,
} from "@/lib/workProcess";
import { legEmissionsTco2e, hasDistance } from "@/lib/transport";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AddLocationDialog } from "@/components/capture/AddLocationDialog";
import { HistoryButton, HistoryTimeline } from "@/components/HistoryLog";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { toast } from "sonner";

type SortKey = "name" | "date" | "by";

/** Remembers the Name column width across sessions. */
const NAME_WIDTH_KEY = "workProcess.nameWidth";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Work Process browser, shaped like a Windows Explorer window: address bar and
 * navigation buttons on top, a folder tree on the left (Phase → Group → Stage),
 * and a sortable details list. Opening an entry pops its detail up in a dialog.
 */
export function WorkProcessStageDialog({
  stage: initialStage,
  open,
  onOpenChange,
  initialEntry,
}: {
  stage: WorkflowStageDef | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the window opens with this entry already selected. */
  initialEntry?: WorkProcessEntry | null;
}) {
  const { data: entries = [] } = useWorkProcessEntries();
  const { data: feedstock = [] } = useFeedstock();
  const routerNav = useNavigate();
  const upsert = useUpsert<WorkProcessEntry>(Collections.workProcess);
  const del = useDelete(Collections.workProcess);
  const { user, role } = useAuth();
  const canWrite = hasPermission(role, Permission.AddFeedstock);
  const canEdit = hasPermission(role, Permission.EditFeedstock);
  const canDelete = hasPermission(role, Permission.DeleteFeedstock);

  const [stage, setStage] = useState<WorkflowStageDef | null>(initialStage);
  const [history, setHistory] = useState<(WorkflowStageDef | null)[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [view, setView] = useState<"details" | "tiles">("details");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Form overlay: null = closed, entry = editing, "new" = creating.
  const [form, setForm] = useState<null | "new" | WorkProcessEntry>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [historyFor, setHistoryFor] = useState<WorkProcessEntry | null>(null);
  // Entry awaiting delete confirmation.
  const [pendingDelete, setPendingDelete] = useState<WorkProcessEntry | null>(null);
  // Draggable width of the Name column, so long batch IDs can be read in full.
  const [nameWidth, setNameWidth] = useState(
    () => Number(localStorage.getItem(NAME_WIDTH_KEY)) || 320
  );

  useEffect(() => {
    if (!open) return;
    setStage(initialStage);
    setHistory([]);
    setSelectedId(initialEntry?.id ?? null);
    setQuery("");
    setForm(null);
  }, [open, initialStage, initialEntry]);

  const navigate = (next: WorkflowStageDef | null) => {
    setHistory((h) => [...h, stage]);
    setStage(next);
    setSelectedId(null);
    setQuery("");
  };

  const back = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      setStage(h[h.length - 1]);
      setSelectedId(null);
      return h.slice(0, -1);
    });
  };

  const tree = useMemo(phases, []);
  const countByStage = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of entries) m[e.StageKey] = (m[e.StageKey] ?? 0) + 1;
    return m;
  }, [entries]);

  const rows = useMemo(() => {
    if (!stage) return [];
    const q = query.trim().toLowerCase();
    const list = entries.filter(
      (e) =>
        e.StageKey === stage.Key &&
        (!q ||
          entryTitle(e).toLowerCase().includes(q) ||
          Object.values(e.Values).some((v) => v?.toLowerCase().includes(q)))
    );
    const get = (e: WorkProcessEntry) =>
      sort.key === "name" ? entryTitle(e).toLowerCase()
      : sort.key === "by" ? (e.CapturedBy ?? "").toLowerCase()
      : e.Timestamp;
    return [...list].sort((a, b) => (get(a) < get(b) ? -sort.dir : get(a) > get(b) ? sort.dir : 0));
  }, [entries, stage, query, sort]);

  const selected = rows.find((e) => e.id === selectedId) ?? null;

  /** Jump from the detail popup to the entry's linked feedstock, if any. */
  const openFeedstock = (entry: WorkProcessEntry) => {
    const f = feedstockForEntry(entry.Values, feedstock);
    if (!f) {
      toast.info("No feedstock batch is linked to this entry.");
      return;
    }
    onOpenChange(false);
    routerNav(`/feedstock/${encodeURIComponent(f.id)}`);
  };

  const startResize = (ev: React.PointerEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    const startX = ev.clientX;
    const startW = nameWidth;
    const move = (m: PointerEvent) => setNameWidth(Math.max(140, startW + m.clientX - startX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setNameWidth((w) => {
        localStorage.setItem(NAME_WIDTH_KEY, String(w));
        return w;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 1 ? -1 : 1 }));

  const startNew = () => {
    if (!stage) return;
    const seed: Record<string, string> = {};
    for (const f of stageFields(stage)) if (f.Type === "date") seed[f.Key] = todayIso();
    setValues(seed);
    setForm("new");
  };

  const startEdit = (entry: WorkProcessEntry) => {
    setValues({ ...entry.Values });
    setForm(entry);
  };

  const remove = async () => {
    if (!canDelete || !pendingDelete) return;
    await del.mutateAsync(pendingDelete.id);
    if (selectedId === pendingDelete.id) setSelectedId(null);
    setPendingDelete(null);
    toast.success("Entry deleted");
  };

  const submit = async () => {
    if (!stage) return;
    const editing = form && form !== "new" ? form : null;
    if (editing ? !canEdit : !canWrite) return;
    const filled = Object.fromEntries(Object.entries(values).filter(([, v]) => v?.trim()));
    if (Object.keys(filled).length === 0) {
      toast.error("Fill in at least one field.");
      return;
    }
    if (editing) {
      await upsert.mutateAsync({ ...editing, Values: filled });
      toast.success("Entry updated");
    } else {
      const id = `wpe_${crypto.randomUUID()}`;
      await upsert.mutateAsync({
        id, Id: id,
        StageKey: stage.Key, StageTitle: stage.Title, Values: filled,
        CapturedBy: user?.FullName || user?.Email || "Operator",
        CapturedByEmail: user?.Email ?? "",
        Timestamp: new Date().toISOString(),
      });
      toast.success("Entry saved");
      setSelectedId(id);
    }
    setForm(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[85vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="sr-only">
          <DialogTitle>{stage ? stage.Title : "Work Process"}</DialogTitle>
        </DialogHeader>

        {/* ── Toolbar: navigation, address bar, search ── */}
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 pr-12 shrink-0">
          <button
            onClick={back}
            disabled={history.length === 0}
            aria-label="Back"
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigate(null)}
            disabled={!stage}
            aria-label="Up one level"
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ArrowUp className="h-4 w-4" />
          </button>

          {/* Address bar */}
          <div className="flex min-w-0 flex-1 items-center gap-0.5 rounded border border-border bg-background px-2 py-1 text-xs">
            <button
              onClick={() => navigate(null)}
              className="shrink-0 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              Work Process
            </button>
            {stage && (
              <>
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                <span className="shrink-0 px-1.5 py-0.5 text-muted-foreground">{stage.Phase}</span>
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                <span className="truncate px-1.5 py-0.5 font-medium text-foreground">{stage.Title}</span>
              </>
            )}
          </div>

          <div className="relative hidden sm:block">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={!stage}
              placeholder={stage ? `Search ${stage.Title}` : "Search"}
              className="w-44 rounded border border-border bg-background py-1 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            />
          </div>
        </div>

        {/* ── Panes ── */}
        <div className="flex min-h-0 flex-1">
          {/* Navigation pane */}
          <nav className="hidden w-56 shrink-0 overflow-auto border-r border-border bg-muted/20 py-2 md:block">
            {tree.map((phase) => (
              <div key={phase.Name} className="mb-1">
                <button
                  onClick={() => setCollapsed((c) => ({ ...c, [phase.Name]: !c[phase.Name] }))}
                  className="flex w-full items-center gap-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  {collapsed[phase.Name] ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {phase.Name}
                </button>
                {!collapsed[phase.Name] &&
                  phase.Groups.map((group, gi) => (
                    <div key={`${phase.Name}:${gi}`}>
                      {group.Title && (
                        <p className="px-2 py-1 pl-6 text-[11px] text-muted-foreground/80">{group.Title}</p>
                      )}
                      {group.Stages.map((s) => (
                        <button
                          key={s.Key}
                          onClick={() => navigate(s)}
                          className={`flex w-full items-center gap-2 py-1 pr-2 text-left text-xs transition-colors ${
                            group.Title ? "pl-9" : "pl-6"
                          } ${
                            stage?.Key === s.Key
                              ? "bg-primary/10 font-medium text-foreground"
                              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          }`}
                        >
                          <Folder className={`h-3.5 w-3.5 shrink-0 ${stage?.Key === s.Key ? "text-primary" : ""}`} />
                          <span className="truncate">{s.Title}</span>
                          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                            {countByStage[s.Key] ?? 0}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
              </div>
            ))}
          </nav>

          {/* Content pane */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Command strip */}
            <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 shrink-0">
              {stage && canWrite && (
                <button
                  onClick={startNew}
                  className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                >
                  <Plus className="h-3.5 w-3.5 text-primary" /> New entry
                </button>
              )}
              <div className="ml-auto flex items-center gap-0.5">
                <button
                  onClick={() => setView("details")}
                  aria-label="Details view"
                  aria-pressed={view === "details"}
                  className={`rounded p-1.5 transition-colors ${view === "details" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}
                >
                  <Rows3 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setView("tiles")}
                  aria-label="Tiles view"
                  aria-pressed={view === "tiles"}
                  className={`rounded p-1.5 transition-colors ${view === "tiles" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="relative flex min-h-0 flex-1">
              <div className="min-w-0 flex-1 overflow-auto">
                {/* Root: stages as folders */}
                {!stage && (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1 p-3">
                    {tree.flatMap((p) => p.Groups.flatMap((g) => g.Stages)).map((s) => (
                      <button
                        key={s.Key}
                        onDoubleClick={() => navigate(s)}
                        onClick={() => navigate(s)}
                        className="flex flex-col items-center gap-1.5 rounded p-3 text-center hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none transition-colors"
                      >
                        <Folder className="h-9 w-9 text-primary" strokeWidth={1.5} />
                        <span className="text-xs font-medium text-foreground leading-tight">{s.Title}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {countByStage[s.Key] ?? 0} item{(countByStage[s.Key] ?? 0) === 1 ? "" : "s"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Stage folder: entries as files */}
                {stage && view === "details" && (
                  <table
                    className="table-fixed text-xs"
                    style={{ width: Math.max(nameWidth + 330, 100), minWidth: "100%" }}
                  >
                    <colgroup>
                      <col style={{ width: nameWidth }} />
                      <col style={{ width: 170 }} />
                      <col />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-background">
                      <tr className="border-b border-border text-muted-foreground">
                        {([["name", "Name"], ["date", "Date modified"], ["by", "Recorded by"]] as [SortKey, string][]).map(
                          ([key, label]) => (
                            <th key={key} className="relative px-3 py-1.5 text-left font-medium">
                              <button
                                onClick={() => toggleSort(key)}
                                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                              >
                                {label}
                                {sort.key === key && (
                                  <ChevronDown className={`h-3 w-3 ${sort.dir === 1 ? "rotate-180" : ""}`} />
                                )}
                              </button>
                              {key === "name" && (
                                <span
                                  role="separator"
                                  aria-orientation="vertical"
                                  aria-label="Resize Name column"
                                  onPointerDown={startResize}
                                  onDoubleClick={() => {
                                    localStorage.removeItem(NAME_WIDTH_KEY);
                                    setNameWidth(320);
                                  }}
                                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none bg-border/60 hover:bg-primary"
                                />
                              )}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((e) => (
                        <EntryMenu
                          key={e.id}
                          entry={e}
                          canEdit={canEdit}
                          canDelete={canDelete}
                          onOpen={() => setSelectedId(e.id)}
                          onEdit={() => startEdit(e)}
                          onHistory={() => setHistoryFor(e)}
                          onDelete={() => setPendingDelete(e)}
                        >
                          <tr
                            onClick={() => setSelectedId(e.id)}
                            tabIndex={0}
                            onKeyDown={(ev) => ev.key === "Enter" && setSelectedId(e.id)}
                            className={`cursor-default border-b border-border/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring ${
                              selectedId === e.id ? "bg-primary/10" : "hover:bg-muted/50"
                            }`}
                          >
                            <td className="truncate px-3 py-1.5">
                              <span className="flex items-center gap-2">
                                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate font-medium text-foreground">{entryTitle(e)}</span>
                                <span className="truncate text-muted-foreground">{entrySubtitle(e)}</span>
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                              {formatEntryTimestamp(e.Timestamp)}
                            </td>
                            <td className="truncate px-3 py-1.5 text-muted-foreground">{e.CapturedBy}</td>
                          </tr>
                        </EntryMenu>
                      ))}
                    </tbody>
                  </table>
                )}

                {stage && view === "tiles" && (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-1 p-3">
                    {rows.map((e) => (
                      <EntryMenu
                        key={e.id}
                        entry={e}
                        canEdit={canEdit}
                          canDelete={canDelete}
                        onOpen={() => setSelectedId(e.id)}
                        onEdit={() => startEdit(e)}
                        onHistory={() => setHistoryFor(e)}
                          onDelete={() => setPendingDelete(e)}
                      >
                      <button
                        onClick={() => setSelectedId(e.id)}
                        className={`flex w-full items-start gap-2 rounded p-2 text-left transition-colors ${
                          selectedId === e.id ? "bg-primary/10" : "hover:bg-muted/60"
                        }`}
                      >
                        <FileText className="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-foreground">{entryTitle(e)}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{entrySubtitle(e)}</span>
                          <span className="block text-[10px] text-muted-foreground/80">
                            {formatEntryTimestamp(e.Timestamp)}
                          </span>
                        </span>
                      </button>
                      </EntryMenu>
                    ))}
                  </div>
                )}

                {stage && rows.length === 0 && (
                  <p className="p-10 text-center text-xs text-muted-foreground">
                    {query ? `No entries match “${query}”.` : "This folder is empty."}
                  </p>
                )}
              </div>

            </div>

            {/* Status bar */}
            <div className="flex items-center gap-3 border-t border-border bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground shrink-0">
              <span>
                {stage ? `${rows.length} item${rows.length === 1 ? "" : "s"}` : `${WORK_PROCESS_FOLDERS} folders`}
              </span>
            </div>
          </div>
        </div>

        {/* ── Form overlay ── */}
        {form && stage && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
            <div className="flex max-h-full w-full max-w-lg flex-col rounded-lg border border-border bg-background shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <p className="text-sm font-semibold text-foreground">
                  {stage.Title} · {form === "new" ? "New entry" : "Edit entry"}
                </p>
                <button
                  onClick={() => setForm(null)}
                  aria-label="Close form"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
                {stage.Sections.map((section) => (
                  <div key={section.Title} className="space-y-3">
                    {stage.Sections.length > 1 && (
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {section.Title}
                      </p>
                    )}
                    {section.Fields.map((field) => {
                      const isZeroAmount =
                        field.Key === amountFieldForStage(stage.Key) && values[field.Key]?.trim() === "0";
                      // Sanity check for the trail's Distance: how far origin and drop
                      // actually sit apart. Never auto-filled — see trailStraightLineKm.
                      const straightKm =
                        field.Key === TRAIL.distanceKey ? trailStraightLineKm(values) : null;
                      // Expected Grade-A output at this reactor's measured yield, from
                      // "Pengiraan Keperluan Bahan Mentah Dan Tempoh Pengeluaran Biochar".
                      // A hint only — never overwrites what the operator actually measures.
                      const reactorModel: ReactorModel | null =
                        stage.Key === "production_05" ? "Ecosfera 0.5"
                        : stage.Key === "production_10" ? "Ecosfera 1.0"
                        : null;
                      const expectedYieldKg =
                        reactorModel && field.Key === "biomass_input_amount" && parseFloat(values[field.Key] || "0") > 0
                          ? expectedGradeAYieldKg(parseFloat(values[field.Key]), reactorModel)
                          : null;
                      return (
                        <div key={field.Key}>
                          <FieldInput
                            field={field}
                            value={values[field.Key] ?? ""}
                            coords={values[field.Key + COORDS_SUFFIX] ?? ""}
                            onChange={(v, coords) =>
                              setValues((prev) => ({
                                ...prev,
                                [field.Key]: v,
                                ...(coords === undefined ? {} : { [field.Key + COORDS_SUFFIX]: coords }),
                              }))
                            }
                          />
                          {/* A recorded 0 is held as an audit warning until confirmed real. */}
                          {isZeroAmount && (
                            <label className="mt-1.5 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-foreground cursor-pointer">
                              <input
                                type="checkbox"
                                checked={values[field.Key + ZERO_OK_SUFFIX] === "true"}
                                onChange={(e) =>
                                  setValues((prev) => ({
                                    ...prev,
                                    [field.Key + ZERO_OK_SUFFIX]: e.target.checked ? "true" : "",
                                  }))
                                }
                                className="accent-amber-500"
                              />
                              This is really 0 kg — verified (clears the mass-balance warning)
                            </label>
                          )}
                          {expectedYieldKg !== null && (
                            <p className="mt-1.5 text-[11px] text-muted-foreground">
                              At this reactor's measured yield, expect ≈{" "}
                              <span className="font-medium text-foreground">{expectedYieldKg.toFixed(0)} kg</span>{" "}
                              Grade-A biochar. Record what actually comes out, not this estimate.
                            </p>
                          )}
                          {/* Straight-line floor between origin and drop. The road is
                              always longer, so this only flags an implausible entry. */}
                          {field.Key === TRAIL.distanceKey && (
                            <p className="mt-1.5 text-[11px] text-muted-foreground">
                              {hasDistance(values[field.Key]) && (
                                <>
                                  Hauling this {Number(values[field.Key])} km on{" "}
                                  {values[TRAIL.fuelKey] || "Other"} emits ≈{" "}
                                  <span className="font-medium text-foreground">
                                    {(legEmissionsTco2e(values[field.Key], values[TRAIL.fuelKey]) * 1000).toFixed(1)} kg CO₂e
                                  </span>
                                  , which comes off this batch's CORCs.{" "}
                                </>
                              )}
                              {straightKm !== null && (
                                <>
                                  Origin and drop sit {straightKm.toFixed(1)} km apart in a straight
                                  line, so the road figure must exceed that — use the odometer.
                                </>
                              )}
                              {straightKm !== null &&
                                Number(values[field.Key]) > 0 &&
                                Number(values[field.Key]) < straightKm && (
                                  <span className="text-amber-500">
                                    {" "}This entry is shorter than the straight line, so it can't be right.
                                  </span>
                                )}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="border-t border-border p-3">
                <button
                  onClick={submit}
                  disabled={upsert.isPending}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {form === "new" ? "Submit entry" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>

      {/* Entry detail, opened by clicking an entry. */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-auto">
          {selected && stage && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-start gap-2 pr-6 text-left">
                  <FileText className="mt-0.5 h-6 w-6 shrink-0 text-primary" strokeWidth={1.5} />
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold">{entryTitle(selected)}</span>
                    <span className="block text-xs font-normal text-muted-foreground">{stage.Title}</span>
                  </span>
                </DialogTitle>
              </DialogHeader>
              <dl className="space-y-1.5 text-sm">
                {stageFields(stage)
                  .filter((f) => selected.Values[f.Key]?.trim())
                  .map((f) => (
                    <div key={f.Key} className="border-b border-border/30 pb-1.5">
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {f.Label}{f.Unit ? ` (${f.Unit})` : ""}
                      </dt>
                      <dd className="break-words text-foreground">{selected.Values[f.Key]}</dd>
                      {f.Type === "location" && selected.Values[f.Key + COORDS_SUFFIX] && (
                        <dd className="font-mono text-[10px] text-muted-foreground">
                          {selected.Values[f.Key + COORDS_SUFFIX]}
                        </dd>
                      )}
                    </div>
                  ))}
              </dl>
              <p className="text-xs text-muted-foreground">
                Recorded by {selected.CapturedBy}
                {selected.CapturedByEmail && selected.CapturedByEmail !== selected.CapturedBy
                  ? ` (${selected.CapturedByEmail})` : ""}
                {" · "}{formatEntryTimestamp(selected.Timestamp)}
              </p>
              {/* Side by side once there's room; stacked on a phone, where
                  "View custody detail" wraps to two lines at half width. */}
              <div className="flex flex-col gap-2 sm:flex-row">
                {canEdit && (
                  <button
                    onClick={() => {
                      const entry = selected;
                      setSelectedId(null);
                      startEdit(entry);
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit entry
                  </button>
                )}
                <button
                  onClick={() => openFeedstock(selected)}
                  disabled={!feedstockForEntry(selected.Values, feedstock)}
                  title={
                    feedstockForEntry(selected.Values, feedstock)
                      ? undefined
                      : "No feedstock batch is linked to this entry"
                  }
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-40 disabled:hover:bg-primary/5 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> View custody detail
                </button>
              </div>
              <HistoryButton
                title="Entry history"
                filter={{ collection: Collections.workProcess, documentId: selected.id }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Entry history, opened from the right-click menu. */}
      <Dialog open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              {historyFor ? entryTitle(historyFor) : ""} · history
            </DialogTitle>
          </DialogHeader>
          {historyFor && (
            <HistoryTimeline
              filter={{ collection: Collections.workProcess, documentId: historyFor.id }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation, opened from the right-click menu. */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete this entry?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 pt-2">
              <span className="block">
                <strong className="text-foreground">{pendingDelete ? entryTitle(pendingDelete) : ""}</strong>
                {pendingDelete ? ` · ${pendingDelete.StageTitle}` : ""}
              </span>
              <span className="block text-xs">
                Recorded by {pendingDelete?.CapturedBy} on{" "}
                {pendingDelete ? formatEntryTimestamp(pendingDelete.Timestamp) : ""}.
              </span>
              <span className="block text-xs">
                The entry is logged in the Audit Trail and can be restored from there.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-3 pt-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              disabled={del.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

/** Right-click menu for an entry row or tile, mirroring Explorer's file menu. */
function EntryMenu({
  entry,
  canEdit,
  canDelete,
  onOpen,
  onEdit,
  onHistory,
  onDelete,
  children,
}: {
  entry: WorkProcessEntry;
  canEdit: boolean;
  canDelete: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onHistory: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onSelect={onOpen} className="text-xs">
          <Eye className="mr-2 h-3.5 w-3.5" /> Open
        </ContextMenuItem>
        {canEdit && (
          <ContextMenuItem onSelect={onEdit} className="text-xs">
            <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onHistory} className="text-xs">
          <History className="mr-2 h-3.5 w-3.5" /> History
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            navigator.clipboard?.writeText(entryTitle(entry));
            toast.success("Name copied");
          }}
          className="text-xs"
        >
          <FileText className="mr-2 h-3.5 w-3.5" /> Copy name
        </ContextMenuItem>
        {canDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onDelete} className="text-xs text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

const WORK_PROCESS_FOLDERS = phases().reduce(
  (n, p) => n + p.Groups.reduce((m, g) => m + g.Stages.length, 0),
  0
);

/**
 * A site field. The coordinate comes from a pre-configured Asset location the
 * user picks — that's the trusted origin/receiving coordinate. Capturing your
 * *own* GPS is gated: it's only accepted when your live position falls inside
 * the chosen site's geofence, so a recorded coordinate genuinely means you were
 * there. Editing the pre-configured list (Save as asset) is admin-only.
 */
function LocationField({
  field,
  label,
  value,
  coords,
  onChange,
}: {
  field: FormField;
  label: React.ReactNode;
  value: string;
  coords?: string;
  onChange: (v: string, coords?: string) => void;
}) {
  const { data: locations = [] } = useLocations();
  const { role } = useAuth();
  const isAdmin = role === UserRole.Admin;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<null | { ok: boolean; msg: string }>(null);

  const selected = locations.find((l) => (l.Name || l.id) === value) ?? null;
  // Keep a legacy free-text value (e.g. an imported "Cyberjaya") selectable so
  // switching this field to coordinates never drops what was already recorded.
  const legacy: LocationData | null =
    value && !selected ? ({ id: value, Name: value, Latitude: "", Longitude: "" } as LocationData) : null;
  const options = legacy ? [legacy, ...locations] : locations;

  const pickSite = (name: string) => {
    const loc = locations.find((l) => (l.Name || l.id) === name);
    onChange(name, loc && loc.Latitude && loc.Longitude ? `${loc.Latitude}, ${loc.Longitude}` : "");
    setStatus(null);
  };

  /** Capture the operator's live GPS, but only accept it inside the site fence. */
  const verifyOnSite = async () => {
    if (!selected || !selected.Latitude || !selected.Longitude) {
      setStatus({ ok: false, msg: "Pick a pre-configured site first — its fence is what we check you against." });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const fix = await getCurrentPosition();
      const radius = Number(selected.GeofenceRadius) || GEOFENCE_RADIUS_M;
      const r = geofenceCheck(fix, [selected], radius);
      if (r.outside) {
        setStatus({
          ok: false,
          msg: `You're ${formatMeters(r.distance ?? 0)} from ${selected.Name} — outside its ${radius} m fence. Keeping the pre-set coordinate.`,
        });
        return;
      }
      onChange(value, `${fix.Latitude}, ${fix.Longitude}`);
      setStatus({
        ok: true,
        msg: `On-site confirmed (${formatMeters(r.distance ?? 0)} away, ±${accuracyMeters(fix)} m). Using your live GPS as the coordinate.`,
      });
    } catch (e) {
      setStatus({ ok: false, msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {label}
      <select
        value={value}
        onChange={(e) => pickSite(e.target.value)}
        className="mt-1 w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground"
      >
        <option value="">— pre-configured site —</option>
        {options.map((l) => <option key={l.id}>{l.Name || l.id}</option>)}
      </select>

      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground font-mono truncate">
          {coords || (value ? "No coordinate on this site" : "Pick a site to load its coordinate")}
        </p>
        {isAdmin && (
          <AddLocationDialog
            onSaved={(l) => onChange(l.Name ?? "", `${l.Latitude}, ${l.Longitude}`)}
            trigger={
              <button type="button" className="shrink-0 text-[10px] text-primary hover:underline">
                + Save as asset
              </button>
            }
          />
        )}
      </div>

      {isAdmin && (
        <button
          type="button"
          onClick={verifyOnSite}
          disabled={busy || !selected}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5 text-primary" />}
          Use my location (on-site only)
        </button>
      )}

      {status && (
        <p
          className={`mt-1.5 flex items-start gap-1.5 text-[11px] ${
            status.ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
          }`}
        >
          {status.ok ? <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" /> : <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />}
          {status.msg}
        </p>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  coords,
  onChange,
}: {
  field: FormField;
  value: string;
  /** "lat,lng" already stored for a location field. */
  coords?: string;
  onChange: (v: string, coords?: string) => void;
}) {
  const { data: zones = [] } = useZones();
  const knownBatches = useKnownBatchIds();
  // Rendered by every branch below (including LocationField), so a field's Hint
  // shows once wherever that field appears, with no per-type wiring.
  const label = (
    <>
      <Label className="text-xs">
        {field.Label}
        {field.Unit ? <span className="text-muted-foreground"> ({field.Unit})</span> : null}
      </Label>
      {field.Hint && (
        <p className="text-[10px] leading-snug text-muted-foreground mt-0.5">{field.Hint}</p>
      )}
    </>
  );

  if (field.Type === "location") {
    return <LocationField field={field} label={label} value={value} coords={coords} onChange={onChange} />;
  }

  if (field.Type === "batch") {
    // Autocomplete of produced batch ids so a draw-down links back to real
    // production, while still allowing a legacy/external id to be typed.
    const listId = `batches-${field.Key}`;
    return (
      <div>
        {label}
        <Input
          list={listId}
          value={value}
          placeholder={field.Placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1"
        />
        <datalist id={listId}>
          {knownBatches.map((b) => <option key={b} value={b} />)}
        </datalist>
      </div>
    );
  }

  if (field.Type === "zone") {
    // Admin-managed options (fallback to the seed set), plus the current value
    // if it predates the list so a saved entry never silently loses its zone.
    const names = zones.length > 0 ? zones.map((z) => z.Name) : DEFAULT_ZONES;
    const options = value && !names.includes(value) ? [value, ...names] : names;
    return (
      <div>
        {label}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground"
        >
          <option value="">—</option>
          {options.map((z) => <option key={z}>{z}</option>)}
        </select>
      </div>
    );
  }

  if (field.Type === "picker") {
    return (
      <div>
        {label}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground"
        >
          <option value="">—</option>
          {field.Options?.map((o) => <option key={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  if (field.Type === "multiline") {
    return (
      <div>
        {label}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground resize-none"
        />
      </div>
    );
  }

  return (
    <div>
      {label}
      <Input
        type={field.Type === "number" ? "number" : field.Type === "date" ? "date" : "text"}
        value={value}
        placeholder={field.Placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
      />
    </div>
  );
}
