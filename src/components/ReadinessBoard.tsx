import { useMemo, useState } from "react";
import { ChevronDown, Loader2, Circle, CircleDashed, CheckCircle2, User, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useReadinessStatus } from "@/hooks/useCollection";
import { useUpsert } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import { useAuth } from "@/lib/auth";
import { hasPermission, Permission } from "@/lib/rbac";
import { Progress } from "@/components/ui/progress";
import { BentoCard } from "@/components/BentoCard";
import {
  READINESS_CATALOG,
  READINESS_ATTR_LABELS,
  READINESS_STATUS_ORDER,
  READINESS_STATUS_LABEL,
  categoryActivityCount,
  type ReadinessActivity,
  type ReadinessCategory,
  type ReadinessStatusValue,
  type ReadinessStatusDoc,
} from "@/lib/readiness";

const STATUS_STYLE: Record<ReadinessStatusValue, { icon: typeof Circle; className: string }> = {
  not_started: { icon: Circle, className: "text-muted-foreground border-border/60" },
  in_progress: { icon: CircleDashed, className: "text-amber-500 border-amber-500/40 bg-amber-500/10" },
  done: { icon: CheckCircle2, className: "text-primary border-primary/40 bg-primary/10" },
};

export function ReadinessBoard() {
  const { data: statuses = [], isLoading } = useReadinessStatus();
  const upsert = useUpsert<ReadinessStatusDoc>(Collections.readiness, { surfaceErrors: true });
  const { user, role } = useAuth();
  const canWrite = hasPermission(role, Permission.AddFeedstock);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newTaskLabel, setNewTaskLabel] = useState("");
  const [newTaskPic, setNewTaskPic] = useState("");

  // activity Key -> current status value (defaults to not_started when absent).
  const statusByKey = useMemo(() => {
    const m: Record<string, ReadinessStatusValue> = {};
    for (const s of statuses) m[s.id] = s.Status;
    return m;
  }, [statuses]);

  const doneCount = (cat: ReadinessCategory) =>
    cat.Sections.reduce(
      (n, s) => n + s.Activities.filter((a) => statusByKey[a.Key] === "done").length,
      0
    );

  const totals = useMemo(() => {
    const all = READINESS_CATALOG.flatMap((c) => c.Sections.flatMap((s) => s.Activities));
    const done = all.filter((a) => statusByKey[a.Key] === "done").length;
    return { done, total: all.length };
  }, [statusByKey]);

  const customTasks = statuses.filter((s) => s.id.startsWith("custom_"));

  const cycle = (activity: ReadinessActivity) => {
    if (!canWrite) return;
    const current = statusByKey[activity.Key] ?? "not_started";
    const next = READINESS_STATUS_ORDER[(READINESS_STATUS_ORDER.indexOf(current) + 1) % READINESS_STATUS_ORDER.length];
    upsert.mutate({
      id: activity.Key,
      Status: next,
      UpdatedBy: user?.FullName || user?.Email || "Operator",
      Timestamp: new Date().toISOString(),
    });
  };

  const cycleCustom = (id: string) => {
    if (!canWrite) return;
    const current = statusByKey[id] ?? "not_started";
    const next = READINESS_STATUS_ORDER[(READINESS_STATUS_ORDER.indexOf(current) + 1) % READINESS_STATUS_ORDER.length];
    const task = statuses.find((s) => s.id === id);
    upsert.mutate({
      id,
      Status: next,
      Label: task?.Label,
      PIC: task?.PIC,
      UpdatedBy: user?.FullName || user?.Email || "Operator",
      Timestamp: new Date().toISOString(),
    });
  };

  const addCustomTask = () => {
    if (!newTaskLabel.trim() || !canWrite) return;
    const id = `custom_${Date.now()}`;
    upsert.mutate({
      id,
      Status: "not_started",
      Label: newTaskLabel.trim(),
      PIC: newTaskPic.trim() || user?.FullName || "Operator",
      UpdatedBy: user?.FullName || user?.Email || "Operator",
      Timestamp: new Date().toISOString(),
    });
    setNewTaskLabel("");
    setNewTaskPic("");
    setAddDialogOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall readiness banner */}
      <BentoCard className="!p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Operation Readiness · Ecosfera 3.0 Bukit Damar</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {totals.done} of {totals.total} activities complete
            </p>
          </div>
          <span className="text-2xl font-bold text-primary">
            {totals.total ? Math.round((totals.done / totals.total) * 100) : 0}%
          </span>
        </div>
        <Progress value={totals.total ? (totals.done / totals.total) * 100 : 0} className="h-2 mt-3" />
        {!canWrite && (
          <p className="text-[11px] text-muted-foreground mt-2">
            Read-only — sign in as Operator/Manager/Admin to update statuses.
          </p>
        )}
      </BentoCard>

      {/* Custom Tasks Section */}
      <div className="rounded-2xl border border-border/50 bg-card/40 overflow-hidden">
        <div className="flex w-full items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 shrink-0">
              <Plus className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Custom Tasks</p>
              <p className="text-[11px] text-muted-foreground">{customTasks.length} task{customTasks.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <button disabled={!canWrite} className="inline-flex items-center gap-2 rounded-lg border border-primary/40 text-primary px-3 py-2 text-xs font-medium hover:bg-primary/10 transition-colors disabled:opacity-60">
                <Plus className="h-3.5 w-3.5" /> Add Task
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Custom Task</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label htmlFor="task-label" className="text-xs">Task Label *</Label>
                  <Input
                    id="task-label"
                    value={newTaskLabel}
                    onChange={(e) => setNewTaskLabel(e.target.value)}
                    placeholder="e.g. Conduct equipment audit"
                    onKeyDown={(e) => e.key === "Enter" && addCustomTask()}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="task-pic" className="text-xs">Person In Charge (optional)</Label>
                  <Input
                    id="task-pic"
                    value={newTaskPic}
                    onChange={(e) => setNewTaskPic(e.target.value)}
                    placeholder={user?.FullName || "Name"}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setAddDialogOpen(false)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border text-foreground px-3 py-2 text-sm font-medium hover:bg-muted/40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={addCustomTask}
                  disabled={!newTaskLabel.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
                >
                  Create Task
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {customTasks.length > 0 && (
          <div className="border-t border-border/50 px-4 py-3 space-y-1.5">
            {customTasks.map((task) => {
              const status = task.Status;
              const St = STATUS_STYLE[status];
              const StIcon = St.icon;
              return (
                <div key={task.id} className="flex items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/30">
                  <button
                    onClick={() => cycleCustom(task.id)}
                    disabled={!canWrite}
                    title={canWrite ? `Click to advance · ${READINESS_STATUS_LABEL[status]}` : READINESS_STATUS_LABEL[status]}
                    className={`mt-0.5 flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0 transition-colors ${St.className} ${canWrite ? "cursor-pointer hover:brightness-110" : "cursor-default"}`}
                  >
                    <StIcon className="h-3 w-3" />
                    <span className="hidden sm:inline">{READINESS_STATUS_LABEL[status]}</span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {task.Label || "Untitled"}
                    </p>
                    {task.PIC && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                        <User className="h-3 w-3" /> {task.PIC}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {READINESS_CATALOG.map((cat) => {
        const Icon = cat.Icon;
        const total = categoryActivityCount(cat);
        const done = doneCount(cat);
        const pct = total ? Math.round((done / total) * 100) : 0;
        const isOpen = expanded[cat.Key] ?? false;
        return (
          <div key={cat.Key} className="rounded-2xl border border-border/50 bg-card/40 overflow-hidden">
            <button
              onClick={() => setExpanded((e) => ({ ...e, [cat.Key]: !isOpen }))}
              className="flex w-full items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{cat.Title}</p>
                <p className="text-[11px] text-muted-foreground truncate">{cat.Description}</p>
              </div>
              <div className="w-28 shrink-0 hidden sm:block">
                <Progress value={pct} className="h-1.5" />
              </div>
              <span className="text-xs font-medium text-foreground shrink-0 tabular-nums">
                {done}/{total}
              </span>
              <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>

            {isOpen && (
              <div className="border-t border-border/50 divide-y divide-border/40">
                {cat.Sections.map((section) => (
                  <div key={`${cat.Key}-${section.No}-${section.Title}`} className="px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      {section.No != null ? `${section.No}. ` : ""}{section.Title}
                    </p>
                    <div className="space-y-1.5">
                      {section.Activities.map((a) => {
                        const status = statusByKey[a.Key] ?? "not_started";
                        const St = STATUS_STYLE[status];
                        const StIcon = St.icon;
                        return (
                          <div key={a.Key} className="flex items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/30">
                            <button
                              onClick={() => cycle(a)}
                              disabled={!canWrite}
                              title={canWrite ? `Click to advance · ${READINESS_STATUS_LABEL[status]}` : READINESS_STATUS_LABEL[status]}
                              className={`mt-0.5 flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0 transition-colors ${St.className} ${canWrite ? "cursor-pointer hover:brightness-110" : "cursor-default"}`}
                            >
                              <StIcon className="h-3 w-3" />
                              <span className="hidden sm:inline">{READINESS_STATUS_LABEL[status]}</span>
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm ${status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}>
                                {a.Label}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                {a.PIC && (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <User className="h-3 w-3" /> {a.PIC}
                                  </span>
                                )}
                                {Object.entries(a.Attrs).map(([k, v]) => (
                                  <span key={k} className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                    {READINESS_ATTR_LABELS[k] ?? k}: {v}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
