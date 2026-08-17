import { BentoCard } from "@/components/BentoCard";
import { InfoTip } from "@/components/InfoTip";
import { Loader2, RefreshCw, Send, CloudUpload } from "lucide-react";
import { useFeedstock, useWorkProcessEntries } from "@/hooks/useCollection";
import {
  CORC_WIDGET_STAGES,
  STAGE_RM_PER_TONNE,
  stageCorcMultiplier,
  type CorcWidgetStage,
  type ValueChainBasis,
} from "@/lib/valueChain";
import { buildCulaRecords, STAGE_TO_CULA_LAYER, type CulaRecord } from "@/lib/cula";
import { useMemo, useState, useEffect } from "react";
import { fmt } from "@/lib/format";

/** Invert the stage -> CULA-layer map so an admin edit on a record maps back to a rate. */
const LAYER_TO_STAGE: Record<string, CorcWidgetStage> = Object.fromEntries(
  CORC_WIDGET_STAGES.map((s) => [STAGE_TO_CULA_LAYER[s], s])
);

const RATE_STAGES: CorcWidgetStage[] = [
  "Feedstock Collection",
  "Feedstock Delivery",
  "Feedstock Pre-Processing",
  "Material Conversion",
  "Application",
  "Carbon Sink",
  "Carbon Certification",
];

const DEFAULT_BASIS: ValueChainBasis = {
  preProcessingEfficiency: 0.5,
  conversionEfficiency: 0.25,
  cdrRatio: 1,
  applicationStorageRatio: 1,
  biocharCorcConversion: 2,
  sources: [],
};

const CONFIG_KEY = "cula-admin-config-v1";

interface SavedConfig {
  rates: Record<string, number>;
  conversionEfficiency: number;
  preProcessingEfficiency: number;
}

function loadConfig(): SavedConfig {
  const rates: Record<string, number> = {};
  for (const s of RATE_STAGES) rates[s] = STAGE_RM_PER_TONNE[s] ?? 0;
  const def: SavedConfig = { rates, conversionEfficiency: 0.25, preProcessingEfficiency: 0.5 };
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return { ...def, ...JSON.parse(raw) };
  } catch {
    /* ignore corrupt config */
  }
  return def;
}

export default function CulaAdmin() {
  const { data: feedstock = [], isLoading } = useFeedstock();
  const { data: wpAll = [] } = useWorkProcessEntries();
  const [config, setConfig] = useState<SavedConfig>(loadConfig);
  const [edits, setEdits] = useState<Record<string, { qty: string }>>({});
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Persist the value-chain config the admin adjusts.
  useEffect(() => {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch {
      /* storage full/blocked — ignore */
    }
  }, [config]);

  const basis: ValueChainBasis = useMemo(
    () => ({
      ...DEFAULT_BASIS,
      preProcessingEfficiency: config.preProcessingEfficiency,
      conversionEfficiency: config.conversionEfficiency,
    }),
    [config.preProcessingEfficiency, config.conversionEfficiency]
  );

  /** Base records, then apply the admin's RM-rate edits to rm/corc. */
  const records: CulaRecord[] = useMemo(() => {
    const base = buildCulaRecords(feedstock, wpAll, basis).records;
    return base.map((r) => {
      const stage = LAYER_TO_STAGE[r.custodyStage];
      const rate = stage ? config.rates[stage] : undefined;
      if (stage && rate != null) {
        r.rm =
          r.quantityTco2e != null ? r.quantityTco2e * rate : ((r.quantityKg ?? 0) / 1000) * rate;
      }
      if (stage && r.corcTco2e == null) {
        r.corcTco2e = r.quantityTco2e ?? ((r.quantityKg ?? 0) / 1000) * stageCorcMultiplier(stage, basis);
      }
      return r;
    });
  }, [feedstock, wpAll, basis, config.rates]);

  const setRate = (stage: CorcWidgetStage, v: string) => {
    const n = Number(v);
    setConfig((c) => ({ ...c, rates: { ...c.rates, [stage]: Number.isFinite(n) ? n : 0 } }));
  };

  /** Merge the admin's quantity edits into the records before export. */
  const finalRecords = useMemo(() => {
    const edited = Object.entries(edits);
    if (!edited.length) return records;
    return records.map((r) => {
      const e = edits[r.culaId];
      if (!e || e.qty === "") return r;
      const qty = Number(e.qty);
      if (!Number.isFinite(qty)) return r;
      return { ...r, quantityKg: r.quantityTco2e != null ? undefined : qty, quantityTco2e: r.quantityTco2e != null ? qty : undefined };
    });
  }, [records, edits]);

  const runExport = async () => {
    setExporting(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/cula/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          records: finalRecords,
          exportedAt: new Date().toISOString(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(`Exported ${data.records ?? finalRecords.length} records to CULA`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-96 h-96 -top-48 -right-48 animate-pulse-glow" />
      <div>
        <h1 className="text-2xl font-bold text-foreground">CULA Export</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Adjust the value-chain configuration and the export records, then push clean data to CULA.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading data…
        </div>
      ) : (
        <>
          {/* Value-chain configuration */}
          <BentoCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                Value-Chain Configuration
                <InfoTip text="RM per tonne (or per certified MTe for Certification) applied to the export records, plus the chain efficiencies. Edits here recompute the records below and persist in this browser." />
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {RATE_STAGES.map((stage) => (
                <label key={stage} className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{stage}</span>
                  <input
                    type="number"
                    value={config.rates[stage] ?? 0}
                    onChange={(e) => setRate(stage, e.target.value)}
                    className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
                  />
                </label>
              ))}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Pre-processing efficiency</span>
                <input
                  type="number"
                  step="0.01"
                  value={config.preProcessingEfficiency}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, preProcessingEfficiency: Number(e.target.value) || 0 }))
                  }
                  className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Conversion efficiency</span>
                <input
                  type="number"
                  step="0.01"
                  value={config.conversionEfficiency}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, conversionEfficiency: Number(e.target.value) || 0 }))
                  }
                  className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
                />
              </label>
            </div>
          </BentoCard>

          {/* Export records */}
          <BentoCard>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                Export Records ({records.length})
                <InfoTip text="One record per batch per custody stage with a recorded quantity. Edit a Quantity to override before export; RM/CORC recompute from the configuration above." />
              </h3>
              <button
                onClick={() => setEdits({})}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reset edits
              </button>
            </div>
            {records.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No feedstock records with linked work-process entries to export yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="py-2 pr-3">Batch</th>
                      <th className="py-2 pr-3">Stage</th>
                      <th className="py-2 pr-3">Quantity</th>
                      <th className="py-2 pr-3">CORC (tCO₂e)</th>
                      <th className="py-2 pr-3">RM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => {
                      const edit = edits[r.culaId];
                      const qty = r.quantityKg ?? r.quantityTco2e ?? 0;
                      return (
                        <tr key={r.culaId} className="border-b border-border/40">
                          <td className="py-2 pr-3 font-medium">{r.batchId}</td>
                          <td className="py-2 pr-3 capitalize">{r.custodyStage}</td>
                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              value={edit?.qty ?? qty}
                              onChange={(e) =>
                                setEdits((m) => ({ ...m, [r.culaId]: { qty: e.target.value } }))
                              }
                              className="h-8 w-28 rounded-lg border border-border bg-background px-2 text-sm"
                            />
                            <span className="ml-1 text-xs text-muted-foreground">
                              {r.quantityTco2e != null ? "tCO₂e" : "kg"}
                            </span>
                          </td>
                          <td className="py-2 pr-3">{r.corcTco2e != null ? fmt(r.corcTco2e, 2) : "—"}</td>
                          <td className="py-2 pr-3">{r.rm != null ? fmt(r.rm, 0) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </BentoCard>

          {/* Export action */}
          <BentoCard>
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={runExport}
                disabled={exporting || records.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CloudUpload className="h-4 w-4" />
                )}
                {exporting ? "Exporting…" : "Export to CULA"}
              </button>
              <Send className="hidden" />
              {result && <p className="text-sm text-emerald-500">{result}</p>}
              {error && <p className="text-sm text-red-500">Export failed: {error}</p>}
              <p className="text-xs text-muted-foreground">
                Requires <code className="text-foreground">CULA_WEBHOOK_URL</code> on the server; the
                push is HMAC-signed with <code className="text-foreground">CULA_WEBHOOK_SECRET</code>.
              </p>
            </div>
          </BentoCard>
        </>
      )}
    </div>
  );
}
