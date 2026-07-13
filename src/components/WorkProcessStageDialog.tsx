import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2, ChevronLeft, ClipboardList, Pencil } from "lucide-react";
import { useUpsert, useWorkProcessEntries } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import { useAuth } from "@/lib/auth";
import { hasPermission, Permission } from "@/lib/rbac";
import {
  type WorkflowStageDef, type WorkProcessEntry, type FormField,
  stageFields, entryTitle, entrySubtitle, prettify, formatEntryTimestamp,
} from "@/lib/workProcess";
import { HistoryButton } from "@/components/HistoryLog";
import { toast } from "sonner";

type Mode =
  | { view: "list" }
  | { view: "form" }
  | { view: "detail"; entry: WorkProcessEntry };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function WorkProcessStageDialog({
  stage,
  open,
  onOpenChange,
  initialEntry,
}: {
  stage: WorkflowStageDef | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog opens straight to this entry's detail view. */
  initialEntry?: WorkProcessEntry | null;
}) {
  const { data: entries = [] } = useWorkProcessEntries();
  const upsert = useUpsert<WorkProcessEntry>(Collections.workProcess);
  const { user, role } = useAuth();
  const canWrite = hasPermission(role, Permission.AddFeedstock);
  const canEdit = hasPermission(role, Permission.EditFeedstock);
  const [mode, setMode] = useState<Mode>({ view: "list" });
  const [values, setValues] = useState<Record<string, string>>({});
  // When set, the form is editing an existing entry rather than creating one.
  const [editing, setEditing] = useState<WorkProcessEntry | null>(null);

  // Jump straight to a specific entry's detail when asked (e.g. from search).
  useEffect(() => {
    if (open && initialEntry) setMode({ view: "detail", entry: initialEntry });
  }, [open, initialEntry]);

  const stageEntries = useMemo(
    () =>
      stage
        ? entries
            .filter((e) => e.StageKey === stage.Key)
            .sort((a, b) => (a.Timestamp < b.Timestamp ? 1 : -1))
        : [],
    [entries, stage]
  );

  if (!stage) return null;
  const Icon = stage.Icon;

  const startNew = () => {
    // Date fields default to today, matching the .NET StageFormPage DatePicker.
    const seed: Record<string, string> = {};
    for (const f of stageFields(stage)) if (f.Type === "date") seed[f.Key] = todayIso();
    setValues(seed);
    setEditing(null);
    setMode({ view: "form" });
  };

  const startEdit = (entry: WorkProcessEntry) => {
    setValues({ ...entry.Values });
    setEditing(entry);
    setMode({ view: "form" });
  };

  const submit = async () => {
    if (editing ? !canEdit : !canWrite) return;
    const filled = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v?.trim())
    );
    if (Object.keys(filled).length === 0) {
      toast.error("Fill in at least one field.");
      return;
    }
    if (editing) {
      // Update in place: keep the original id, author and capture time so the
      // upsert overwrites the existing row and records the change in history.
      const updated: WorkProcessEntry = { ...editing, Values: filled };
      await upsert.mutateAsync(updated);
      toast.success("Entry updated");
      setEditing(null);
      setMode({ view: "detail", entry: updated });
      return;
    }
    const id = `wpe_${crypto.randomUUID()}`;
    const entry: WorkProcessEntry = {
      id,
      Id: id,
      StageKey: stage.Key,
      StageTitle: stage.Title,
      Values: filled,
      CapturedBy: user?.FullName || user?.Email || "Operator",
      Timestamp: new Date().toISOString(),
    };
    await upsert.mutateAsync(entry);
    toast.success("Entry saved");
    setMode({ view: "list" });
  };

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setMode({ view: "list" });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode.view !== "list" && (
              <button
                onClick={() => { setEditing(null); setMode({ view: "list" }); }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Back to entries"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <Icon className="h-4 w-4 text-primary" />
            {stage.Title}
            {mode.view === "form" && (editing ? " · Edit Entry" : " · New Entry")}
          </DialogTitle>
        </DialogHeader>

        {mode.view === "list" && (
          <>
            <p className="text-xs text-muted-foreground -mt-1">{stage.Description}</p>
            <div className="space-y-2 max-h-80 overflow-auto py-1">
              {stageEntries.length === 0 ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm py-10">
                  <ClipboardList className="h-6 w-6 opacity-50" />
                  No entries yet.
                </div>
              ) : (
                stageEntries.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setMode({ view: "detail", entry: e })}
                    className="w-full text-left rounded-lg border border-border/50 px-3 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{entryTitle(e)}</p>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatEntryTimestamp(e.Timestamp)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{entrySubtitle(e)}</p>
                  </button>
                ))
              )}
            </div>
            {canWrite && (
              <button
                onClick={startNew}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" /> New Entry
              </button>
            )}
          </>
        )}

        {mode.view === "form" && (
          <>
            <div className="space-y-4 max-h-[60vh] overflow-auto py-1">
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
                      onChange={(v) => setValues((prev) => ({ ...prev, [field.Key]: v }))}
                    />
                  ))}
                </div>
              ))}
            </div>
            <button
              onClick={submit}
              disabled={upsert.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Submit entry"}
            </button>
          </>
        )}

        {mode.view === "detail" && (
          <div className="space-y-2 max-h-[60vh] overflow-auto py-1">
            {stageFields(stage)
              .filter((f) => mode.entry.Values[f.Key]?.trim())
              .map((f) => (
                <div key={f.Key} className="flex items-start justify-between gap-4 border-b border-border/30 pb-1.5">
                  <span className="text-xs text-muted-foreground shrink-0">
                    {f.Label}{f.Unit ? ` (${f.Unit})` : ""}
                  </span>
                  <span className="text-sm text-foreground text-right break-words">{mode.entry.Values[f.Key]}</span>
                </div>
              ))}
            <div className="flex items-center justify-between pt-2">
              <p className="text-[11px] text-muted-foreground">
                Recorded by {mode.entry.CapturedBy} · {formatEntryTimestamp(mode.entry.Timestamp)}
              </p>
              <div className="flex items-center gap-2">
                {canEdit && (
                  <button
                    onClick={() => startEdit(mode.entry)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                )}
                <HistoryButton
                  title="Entry history"
                  filter={{ collection: Collections.workProcess, documentId: mode.entry.id }}
                />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string;
  onChange: (v: string) => void;
}) {
  const label = (
    <Label className="text-xs">
      {field.Label}
      {field.Unit ? <span className="text-muted-foreground"> ({field.Unit})</span> : null}
    </Label>
  );

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
