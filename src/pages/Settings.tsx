import { BentoCard } from "@/components/BentoCard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useFeedstock } from "@/hooks/useCollection";
import { corcMetrics } from "@/lib/feedstock";
import { Database, Download, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Settings() {
  const { data: feedstock = [] } = useFeedstock();
  const [offline, setOffline] = useState(() => localStorage.getItem("offline_mode") === "true");

  const toggleOffline = (v: boolean) => {
    setOffline(v);
    localStorage.setItem("offline_mode", String(v));
    toast.success(v ? "Offline mode enabled" : "Offline mode disabled");
  };

  const exportCsv = () => {
    const headers = ["Id", "Title", "Type", "Supplier", "Amount", "Status", "CurrentStage", "NetCORC", "DurabilityClass"];
    const rows = feedstock.map((f) => {
      const m = corcMetrics(f);
      return [f.id, f.Title, f.Type, f.Supplier, f.Amount, f.Status, f.CurrentStage ?? "", m.netCorc.toFixed(2), m.durabilityClass]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `corc-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${feedstock.length} batches`);
  };

  return (
    <div className="relative p-6 lg:p-8 space-y-6 max-w-3xl">
      <div className="glow-orb w-72 h-72 -top-36 right-10 animate-pulse-glow" />
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Connection, data &amp; export</p>
      </div>

      <BentoCard>
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" /> Backend Connection
        </h3>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isSupabaseConfigured && !offline ? (
              <><Wifi className="h-4 w-4 text-primary" /> <span className="text-sm text-foreground">Connected to Supabase</span></>
            ) : (
              <><WifiOff className="h-4 w-4 text-amber-400" /> <span className="text-sm text-foreground">Cache / demo mode</span></>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            {isSupabaseConfigured ? "gwtxrtrnkoynxhacgidg" : "not configured"}
          </span>
        </div>
      </BentoCard>

      <BentoCard>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm text-foreground">Offline mode</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">Read from local cache only; skip network requests.</p>
          </div>
          <Switch checked={offline} onCheckedChange={toggleOffline} />
        </div>
      </BentoCard>

      <BentoCard>
        <h3 className="text-sm font-semibold text-foreground mb-1">Export Data</h3>
        <p className="text-[11px] text-muted-foreground mb-4">
          Download all feedstock batches with computed CORCs as CSV (NCMP / audit ready).
        </p>
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-2 rounded-lg bg-primary/15 text-primary px-4 py-2 text-sm font-medium hover:bg-primary/25 transition-colors"
        >
          <Download className="h-4 w-4" /> Export CSV ({feedstock.length})
        </button>
      </BentoCard>
    </div>
  );
}
