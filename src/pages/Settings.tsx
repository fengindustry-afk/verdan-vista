import { BentoCard } from "@/components/BentoCard";
import { AiUsageCard } from "@/components/AiUsageCard";
import { GroupsCard } from "@/components/GroupsCard";
import { ApiKeysCard } from "@/components/ApiKeysCard";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Database, Wifi, WifiOff, Palette, Moon, Sun, Check, AlertTriangle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "@/lib/theme-context";
import { THEME_SETS, swatches } from "@/lib/theme";
import { isEffectivelyOffline, onConnectivityChange, onOfflineSync, pendingSyncCount, clearDataCache } from "@/lib/data";
import { confirmDelete } from "@/components/ConfirmDialog";
import { toast } from "sonner";

export default function Settings() {
  const [online, setOnline] = useState(() => !isEffectivelyOffline());
  const [pending, setPending] = useState(() => pendingSyncCount());
  const { setId, mode, setThemeSet, toggleMode } = useTheme();

  // Reflect live connectivity and any queued writes waiting to sync.
  useEffect(() => {
    setOnline(!isEffectivelyOffline());
    setPending(pendingSyncCount());
    const unsubConnectivity = onConnectivityChange((isOnline) => {
      setOnline(isOnline);
      setPending(pendingSyncCount());
    });
    const unsubSync = onOfflineSync(() => setPending(pendingSyncCount()));
    return () => {
      unsubConnectivity();
      unsubSync();
    };
  }, []);

  return (
    <div className="relative p-6 lg:p-8 space-y-6 max-w-3xl">
      <div className="glow-orb w-72 h-72 -top-36 right-10 animate-pulse-glow" />
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Appearance &amp; connection</p>
      </div>

      <BentoCard>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" /> Appearance
          </h3>
          <button
            onClick={toggleMode}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors"
          >
            {mode === "dark" ? <Moon className="h-3.5 w-3.5 text-primary" /> : <Sun className="h-3.5 w-3.5 text-primary" />}
            {mode === "dark" ? "Dark" : "Light"} mode
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground mb-4">
          Pick a theme. The Dark/Light toggle flips the shade within the selected theme.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {THEME_SETS.map((set) => {
            const active = set.id === setId;
            return (
              <button
                key={set.id}
                onClick={() => setThemeSet(set.id)}
                className={`text-left rounded-xl border p-3 transition-colors ${
                  active ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-foreground">{set.label}</span>
                  {active && <Check className="h-4 w-4 text-primary" />}
                </div>
                <div className="flex gap-1.5 mb-2">
                  {swatches(set, mode).map((c, i) => (
                    <span
                      key={i}
                      className="h-6 w-6 rounded-full border border-border/60"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">{set.description}</p>
              </button>
            );
          })}
        </div>
      </BentoCard>

      <BentoCard>
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" /> Backend Connection
        </h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isSupabaseConfigured && online ? (
              <><Wifi className="h-4 w-4 text-primary" /> <span className="text-sm text-foreground">Online — connected to Supabase</span></>
            ) : (
              <><WifiOff className="h-4 w-4 text-amber-400" /> <span className="text-sm text-foreground">
                {isSupabaseConfigured ? "Offline — showing cached data" : "Cache / demo mode"}
              </span></>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            {isSupabaseConfigured ? "gwtxrtrnkoynxhacgidg" : "not configured"}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          The app automatically uses cached data when you're offline and reloads live data once you reconnect. Any changes made offline are queued and synced automatically.
        </p>
        {pending > 0 && (
          <p className="text-[11px] text-amber-400 mt-2">
            {pending} change{pending === 1 ? "" : "s"} queued — will sync when you're back online.
          </p>
        )}
      </BentoCard>

      <AiUsageCard />

      {/* Management cards with destructive actions (delete group, revoke key) kept last. */}
      <GroupsCard />

      <ApiKeysCard />

      <DangerZone pending={pending} />
    </div>
  );
}

/** Irreversible actions, fenced off at the very bottom in a red-tinted card. */
function DangerZone({ pending }: { pending: number }) {
  const clearCache = async () => {
    if (!(await confirmDelete({
      title: "Clear cached data on this device?",
      description: pending > 0
        ? `${pending} change${pending === 1 ? "" : "s"} queued offline will be discarded and cannot be recovered. Server data is not affected.`
        : "Local cached data is removed and reloaded from the server. Server data is not affected.",
      confirmLabel: "Clear cache",
    }))) return;
    clearDataCache();
    toast.success("Cache cleared — reloading");
    setTimeout(() => window.location.reload(), 400);
  };

  return (
    <BentoCard className="border border-destructive/40">
      <h3 className="text-sm font-semibold text-destructive mb-1 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" /> Danger Zone
      </h3>
      <p className="text-[11px] text-muted-foreground mb-4">
        Irreversible actions. Double-check before you use these.
      </p>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-foreground">Clear cached data on this device</p>
          <p className="text-[11px] text-muted-foreground">
            Drops locally cached rows{pending > 0 ? ` and ${pending} queued offline change${pending === 1 ? "" : "s"}` : ""}, then reloads from the server.
          </p>
        </div>
        <button
          onClick={() => void clearCache()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-destructive/40 text-destructive px-3 py-2 text-sm font-medium hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="h-4 w-4" /> Clear cache
        </button>
      </div>
    </BentoCard>
  );
}
