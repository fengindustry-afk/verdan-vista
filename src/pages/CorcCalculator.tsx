import { BentoCard } from "@/components/BentoCard";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { corcMetrics } from "@/lib/feedstock";
import type { Feedstock } from "@/lib/types";
import { fmt } from "@/lib/format";
import { Calculator, CheckCircle2, XCircle } from "lucide-react";

const ELIGIBLE_TYPES = [
  "Empty Fruit Bunches", "POME", "Palm Kernel Shells", "Palm Fronds",
  "Palm Fiber", "Mesocarp Fiber", "Bio-waste",
];

export default function CorcCalculator() {
  const [type, setType] = useState("Palm Kernel Shells");
  const [amount, setAmount] = useState("2000");
  const [yieldKg, setYieldKg] = useState("");
  const [carbonPct, setCarbonPct] = useState("");
  const [hcorg, setHcorg] = useState("");
  const [lca, setLca] = useState("");

  const m = useMemo(() => {
    const draft: Feedstock = {
      id: "draft",
      Title: "Draft",
      Type: type,
      Date: "",
      Amount: `${amount} kg`,
      Status: "Pending",
      Supplier: "",
      BiocharYieldKg: yieldKg ? Number(yieldKg) : 0,
      CarbonContentPct: carbonPct ? Number(carbonPct) : 0,
      HCorgRatio: hcorg ? Number(hcorg) : 0,
      LcaEmissionsTco2e: lca ? Number(lca) : 0,
    };
    return corcMetrics(draft);
  }, [type, amount, yieldKg, carbonPct, hcorg, lca]);

  const rows = [
    { label: "Effective yield", value: `${fmt(m.effectiveYieldKg, 0)} kg` },
    { label: "Effective carbon %", value: `${fmt(m.effectiveCarbonPct, 0)} %` },
    { label: "Effective H/C₍org₎", value: fmt(m.effectiveHCorg, 2) },
    { label: "Gross removal", value: `${fmt(m.grossRemovalTco2e, 3)} tCO₂e` },
    { label: "Permanence factor", value: `× ${fmt(m.permanenceFactor * 100, 0)}%` },
    { label: "Durable removal", value: `${fmt(m.durableRemovalTco2e, 3)} tCO₂e` },
    { label: "LCA emissions", value: `− ${fmt(m.effectiveLca, 3)} tCO₂e` },
  ];

  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-72 h-72 -top-36 right-10 animate-pulse-glow" />
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Calculator className="h-6 w-6 text-primary" /> CORC Calculator
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Estimate CO₂ Removal Certificates using the Puro-aligned biochar methodology
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <BentoCard>
          <h3 className="text-sm font-semibold text-foreground mb-4">Inputs</h3>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Feedstock type</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="mt-1 w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground"
              >
                {ELIGIBLE_TYPES.map((t) => <option key={t}>{t}</option>)}
                <option>Other (needs review)</option>
              </select>
            </div>
            {[
              { label: "Feedstock amount (kg)", value: amount, set: setAmount, ph: "2000" },
              { label: "Biochar yield (kg) — blank = 30% of amount", value: yieldKg, set: setYieldKg, ph: "auto" },
              { label: "Carbon content (%) — blank = 80%", value: carbonPct, set: setCarbonPct, ph: "80" },
              { label: "H/C₍org₎ ratio — blank = 0.5", value: hcorg, set: setHcorg, ph: "0.5" },
              { label: "LCA emissions (tCO₂e) — blank = 8% of durable", value: lca, set: setLca, ph: "auto" },
            ].map((f) => (
              <div key={f.label}>
                <Label className="text-xs">{f.label}</Label>
                <Input
                  type="number"
                  value={f.value}
                  placeholder={f.ph}
                  onChange={(e) => f.set(e.target.value)}
                  className="mt-1"
                />
              </div>
            ))}
          </div>
        </BentoCard>

        <div className="space-y-4">
          <BentoCard>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Net CORC</p>
                <p className="text-4xl font-bold text-primary mt-1">{fmt(m.netCorc, 2)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{m.durabilityClass}</p>
              </div>
              {m.isCorcEligible ? (
                <span className="flex items-center gap-1 text-primary text-xs"><CheckCircle2 className="h-4 w-4" /> Eligible</span>
              ) : (
                <span className="flex items-center gap-1 text-amber-400 text-xs"><XCircle className="h-4 w-4" /> Not eligible</span>
              )}
            </div>
            {!m.sourcingEligible && (
              <p className="mt-3 text-[11px] text-amber-400">
                This feedstock type needs sourcing review before CORCs can be claimed.
              </p>
            )}
            {!m.durabilityEligible && m.sourcingEligible && (
              <p className="mt-3 text-[11px] text-amber-400">
                H/C₍org₎ must be below 0.7 to pass the permanence threshold.
              </p>
            )}
          </BentoCard>

          <BentoCard>
            <h3 className="text-sm font-semibold text-foreground mb-3">Calculation Breakdown</h3>
            <dl className="space-y-2">
              {rows.map((r) => (
                <div key={r.label} className="flex items-center justify-between text-xs">
                  <dt className="text-muted-foreground">{r.label}</dt>
                  <dd className="text-foreground font-medium">{r.value}</dd>
                </div>
              ))}
            </dl>
          </BentoCard>
        </div>
      </div>
    </div>
  );
}
