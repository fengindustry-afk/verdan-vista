import { useMemo, useState } from "react";
import { Bell, CloudOff, ImageOff, Activity, Trash2, CheckCheck, HardDrive, ShieldAlert } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getCollection } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { Collections } from "@/lib/collections";
import { OPS_FIX, type OpsEvent, type OpsEventKind } from "@/lib/opsLog";
import { useAuth } from "@/lib/auth";
import { UserRole } from "@/lib/rbac";
import { toast } from "sonner";

const KIND_ICON: Record<OpsEventKind, typeof CloudOff> = {
  "r2-upload-failed": CloudOff,
  "r2-sign-failed": CloudOff,
  "storage-upload-failed": HardDrive,
  "image-resolve-failed": ImageOff,
  "ai-analysis-fallback": Activity,
  "honeypot-route-hit": ShieldAlert,
};

const SEEN_KEY = "ops-events-seen-at";

/**
 * Admin bell: operational degradations (storage tier fallbacks, AI skips)
 * logged via logOpsEvent, each with its suggested fix. Unread = events newer
 * than the last time this admin opened the panel (kept in localStorage).
 */
export function NotificationCenter() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [seenAt, setSeenAt] = useState(() => localStorage.getItem(SEEN_KEY) ?? "");
  const isAdmin = role === UserRole.Admin;

  const { data: events = [] } = useQuery({
    queryKey: [Collections.opsEvents],
    queryFn: () => getCollection<OpsEvent>(Collections.opsEvents, { cache: false }),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    enabled: isAdmin,
  });

  const sorted = useMemo(
    () => [...events].sort((a, b) => (b.At ?? "").localeCompare(a.At ?? "")).slice(0, 100),
    [events]
  );
  const unread = seenAt ? sorted.filter((e) => (e.At ?? "") > seenAt).length : sorted.length;

  if (!isAdmin) return null;

  const markSeen = () => {
    const now = new Date().toISOString();
    localStorage.setItem(SEEN_KEY, now);
    setSeenAt(now);
  };

  const clearAll = async () => {
    const { error } = await supabase.from("ops_events").delete().neq("id", "");
    if (error) return toast.error(`Could not clear: ${error.message}`);
    qc.invalidateQueries({ queryKey: [Collections.opsEvents] });
    toast.success("Notifications cleared");
  };

  return (
    <Popover onOpenChange={(o) => o && markSeen()}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5 text-primary" /> System notifications
          </p>
          {sorted.length > 0 && (
            <button onClick={clearAll} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3 w-3" /> Clear all
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-auto">
          {sorted.length === 0 ? (
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground py-8">
              <CheckCheck className="h-4 w-4 text-primary" /> No operational issues logged
            </p>
          ) : (
            sorted.map((e) => {
              const Icon = KIND_ICON[e.Kind] ?? Bell;
              return (
                <div key={e.id} className="px-3 py-2.5 border-b border-border/40 last:border-0">
                  <div className="flex items-start gap-2">
                    <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                    <div className="min-w-0">
                      <p className="text-xs text-foreground">{e.Message}</p>
                      {e.Detail && <p className="text-[11px] text-muted-foreground truncate">{e.Detail}</p>}
                      <p className="text-[11px] text-primary mt-1">{OPS_FIX[e.Kind] ?? ""}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                        {e.At?.slice(0, 19).replace("T", " ")}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
