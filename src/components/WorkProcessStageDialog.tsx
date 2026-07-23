import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus, Loader2, ArrowLeft, ArrowUp, ChevronRight, ChevronDown, Search,
  Folder, FileText, Pencil, LayoutGrid, Rows3, X, History, Eye, Trash2, ExternalLink,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDelete, useFeedstock, useLocations, useUpsert, useWorkProcessEntries } from "@/hooks/useCollection";
import { feedstockForEntry } from "@/lib/feedstock";
import { Collections } from "@/lib/collections";
import { useAuth } from "@/lib/auth";
import { hasPermission, Permission } from "@/lib/rbac";
import {
  type WorkflowStageDef, type WorkProcessEntry, type FormField,
  stageFields, entryTitle, entrySubtitle, formatEntryTimestamp, phases, COORDS_SUFFIX,
} from "@/lib/workProcess";
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
 * a sortable details list in the middle, and a preview pane on the right.
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

  /** Double-click an entry to open its linked feedstock detail, if any. */
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
                            onDoubleClick={() => openFeedstock(e)}
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
                        onDoubleClick={() => openFeedstock(e)}
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

              {/* Preview pane */}
              {selected && stage && (
                <aside className="absolute inset-y-0 right-0 z-10 w-72 shrink-0 overflow-auto border-l border-border bg-background p-3 lg:static lg:bg-muted/20">
                  <button
                    onClick={() => setSelectedId(null)}
                    aria-label="Close preview"
                    className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="mb-3 flex items-start gap-2">
                    <FileText className="mt-0.5 h-8 w-8 shrink-0 text-primary" strokeWidth={1.5} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{entryTitle(selected)}</p>
                      <p className="text-[11px] text-muted-foreground">{stage.Title}</p>
                    </div>
                  </div>
                  <dl className="space-y-1.5">
                    {stageFields(stage)
                      .filter((f) => selected.Values[f.Key]?.trim())
                      .map((f) => (
                        <div key={f.Key} className="border-b border-border/30 pb-1.5">
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {f.Label}{f.Unit ? ` (${f.Unit})` : ""}
                          </dt>
                          <dd className="break-words text-xs text-foreground">{selected.Values[f.Key]}</dd>
                          {f.Type === "location" && selected.Values[f.Key + COORDS_SUFFIX] && (
                            <dd className="font-mono text-[10px] text-muted-foreground">
                              {selected.Values[f.Key + COORDS_SUFFIX]}
                            </dd>
                          )}
                        </div>
                      ))}
                  </dl>
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Recorded by {selected.CapturedBy}
                    {selected.CapturedByEmail && selected.CapturedByEmail !== selected.CapturedBy
                      ? ` (${selected.CapturedByEmail})` : ""}
                    {" · "}{formatEntryTimestamp(selected.Timestamp)}
                  </p>
                  {feedstockForEntry(selected.Values, feedstock) && (
                    <button
                      onClick={() => openFeedstock(selected)}
                      className="mt-3 flex w-full items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> View linked feedstock detail
                    </button>
                  )}
                  <div className="mt-2">
                    <HistoryButton
                      title="Entry history"
                      filter={{ collection: Collections.workProcess, documentId: selected.id }}
                    />
                  </div>
                </aside>
              )}
            </div>

            {/* Status bar */}
            <div className="flex items-center gap-3 border-t border-border bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground shrink-0">
              <span>
                {stage ? `${rows.length} item${rows.length === 1 ? "" : "s"}` : `${WORK_PROCESS_FOLDERS} folders`}
              </span>
              {selected && <span>1 item selected</span>}
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
                    {section.Fields.map((field) => (
                      <FieldInput
                        key={field.Key}
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
                    ))}
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
      <ContextMenuTrigger asChild onContextMenu={onOpen}>
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
  const { data: locations = [] } = useLocations();
  const label = (
    <Label className="text-xs">
      {field.Label}
      {field.Unit ? <span className="text-muted-foreground"> ({field.Unit})</span> : null}
    </Label>
  );

  if (field.Type === "location") {
    return (
      <div>
        {label}
        <select
          value={value}
          onChange={(e) => {
            const name = e.target.value;
            const loc = locations.find((l) => (l.Name || l.id) === name);
            onChange(name, loc ? `${loc.Latitude}, ${loc.Longitude}` : "");
          }}
          className="mt-1 w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground"
        >
          <option value="">—</option>
          {locations.map((l) => <option key={l.id}>{l.Name || l.id}</option>)}
        </select>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground font-mono truncate">
            {coords || "No site selected"}
          </p>
          <AddLocationDialog
            onSaved={(l) => onChange(l.Name ?? "", `${l.Latitude}, ${l.Longitude}`)}
            trigger={
              <button type="button" className="shrink-0 text-[10px] text-primary hover:underline">
                + Capture site here
              </button>
            }
          />
        </div>
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
