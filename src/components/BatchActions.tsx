import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, CheckCircle2, SlidersHorizontal, Loader2 } from "lucide-react";
import { useUpsert, useLocations } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import type { Feedstock } from "@/lib/types";
import { advanceStage, verifyBatch } from "@/lib/feedstockActions";
import { corcInputSchema } from "@/lib/validation";
import { currentStageIndex, CUSTODY_STAGES } from "@/lib/feedstock";
import { useAuth } from "@/lib/auth";
import { hasPermission, Permission, roleDisplayName } from "@/lib/rbac";
import { toast } from "sonner";

export function BatchActions({ batch }: { batch: Feedstock }) {
  const { user, role } = useAuth();
  const upsert = useUpsert<Feedstock>(Collections.feedstock);
  const { data: locations = [] } = useLocations();

  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [corcOpen, setCorcOpen] = useState(false);
  const [locChoice, setLocChoice] = useState("manual");
  const [manualName, setManualName] = useState("");
  const [manualCoords, setManualCoords] = useState("");

  const actorName = user?.FullName || user?.Email || "User";
  const actorRole = roleDisplayName[role];

  const idx = currentStageIndex(batch);
  const canAdvance = idx < CUSTODY_STAGES.length - 1;
  const nextStage = canAdvance ? CUSTODY_STAGES[idx + 1] : null;

  const mayAdvance = hasPermission(role, Permission.EditFeedstock);
  const mayVerify = hasPermission(role, Permission.VerifyFeedstock);

  // CORC input form state
  const [yieldKg, setYieldKg] = useState(String(batch.BiocharYieldKg ?? ""));
  const [carbonPct, setCarbonPct] = useState(String(batch.CarbonContentPct ?? ""));
  const [hcorg, setHcorg] = useState(String(batch.HCorgRatio ?? ""));
  const [pyro, setPyro] = useState(String(batch.PyrolysisTempC ?? ""));
  const [lca, setLca] = useState(String(batch.LcaEmissionsTco2e ?? ""));

  const doAdvance = async () => {
    let name = manualName;
    let coords = manualCoords;
    if (locChoice !== "manual") {
      const loc = locations.find((l) => l.id === locChoice);
      if (loc) {
        name = loc.Name || loc.id;
        coords = `${loc.Latitude}, ${loc.Longitude}`;
      }
    }
    if (!name) {
      toast.error("Choose a site or enter a location.");
      return;
    }
    const updated = advanceStage(batch, actorName, actorRole, name, coords);
    if (!updated) return;
    await upsert.mutateAsync(updated);
    toast.success(`Advanced to ${nextStage}`);
    setAdvanceOpen(false);
    setManualName(""); setManualCoords(""); setLocChoice("manual");
  };

  const doVerify = async () => {
    const updated = verifyBatch(batch, actorName, actorRole);
    await upsert.mutateAsync(updated);
    toast.success("Batch verified");
  };

  const saveCorc = async () => {
    const parsed = corcInputSchema.safeParse({
      biocharYieldKg: yieldKg,
      carbonContentPct: carbonPct,
      hcorgRatio: hcorg,
      pyrolysisTempC: pyro,
      lcaEmissionsTco2e: lca,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid CORC input.");
      return;
    }
    const v = parsed.data;
    const updated: Feedstock = {
      ...batch,
      BiocharYieldKg: v.biocharYieldKg ?? 0,
      CarbonContentPct: v.carbonContentPct ?? 0,
      HCorgRatio: v.hcorgRatio ?? 0,
      PyrolysisTempC: v.pyrolysisTempC ?? 0,
      LcaEmissionsTco2e: v.lcaEmissionsTco2e ?? 0,
    };
    await upsert.mutateAsync(updated);
    toast.success("CORC inputs saved");
    setCorcOpen(false);
  };

  const isVerified = (batch.Status ?? "").toLowerCase() === "verified";

  return (
    <div className="flex flex-wrap gap-2">
      {mayAdvance && canAdvance && (
        <button
          onClick={() => setAdvanceOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Advance to {nextStage} <ArrowRight className="h-4 w-4" />
        </button>
      )}
      {mayVerify && !isVerified && (
        <button
          onClick={doVerify}
          disabled={upsert.isPending}
          className="inline-flex items-center gap-2 rounded-lg border border-primary/40 text-primary px-3 py-2 text-sm font-medium hover:bg-primary/10 transition-colors"
        >
          <CheckCircle2 className="h-4 w-4" /> Verify
        </button>
      )}
      {mayAdvance && (
        <button
          onClick={() => setCorcOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-border text-foreground px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          <SlidersHorizontal className="h-4 w-4" /> Edit CORC inputs
        </button>
      )}

      {/* Advance dialog */}
      <Dialog open={advanceOpen} onOpenChange={setAdvanceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Advance to {nextStage}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Site for this stage</Label>
              <select
                value={locChoice}
                onChange={(e) => setLocChoice(e.target.value)}
                className="mt-1 w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.Name || l.id} ({l.Latitude}, {l.Longitude})</option>
                ))}
                <option value="manual">Enter manually…</option>
              </select>
            </div>
            {locChoice === "manual" && (
              <>
                <div>
                  <Label className="text-xs">Location name</Label>
                  <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="e.g. Pasir Gudang Mill" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Coordinates (optional)</Label>
                  <Input value={manualCoords} onChange={(e) => setManualCoords(e.target.value)} placeholder="1.4709, 103.9015" className="mt-1" />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <button onClick={doAdvance} disabled={upsert.isPending} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-60">
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Confirm
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CORC inputs dialog */}
      <Dialog open={corcOpen} onOpenChange={setCorcOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>CORC Inputs — {batch.Title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {[
              { label: "Biochar yield (kg)", value: yieldKg, set: setYieldKg, ph: "auto = 30% of amount" },
              { label: "Carbon content (%)", value: carbonPct, set: setCarbonPct, ph: "80" },
              { label: "H/C₍org₎ ratio", value: hcorg, set: setHcorg, ph: "0.5" },
              { label: "Pyrolysis temp (°C)", value: pyro, set: setPyro, ph: "560" },
              { label: "LCA emissions (tCO₂e)", value: lca, set: setLca, ph: "auto = 8% of durable" },
            ].map((f) => (
              <div key={f.label}>
                <Label className="text-xs">{f.label}</Label>
                <Input type="number" value={f.value} placeholder={f.ph} onChange={(e) => f.set(e.target.value)} className="mt-1" />
              </div>
            ))}
          </div>
          <DialogFooter>
            <button onClick={saveCorc} disabled={upsert.isPending} className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-60">
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
