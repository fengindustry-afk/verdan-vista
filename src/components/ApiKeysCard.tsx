import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Plus, Trash2, Copy, ShieldAlert } from "lucide-react";
import { BentoCard } from "@/components/BentoCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useApiKeys, useUpsert, useDelete } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import { generateApiKey, hashApiKey, keyIsLive, MCP_ENDPOINT } from "@/lib/apiKeys";
import type { ApiKey } from "@/lib/types";

/**
 * Settings ▸ API Keys. Admins mint read-only keys so a manager can pull data
 * through an MCP client (Claude) without a session token that expires hourly.
 *
 * The plaintext key exists only in this component's state, once, right after
 * it is generated — what reaches the database is its SHA-256 hash. There is no
 * "reveal" because there is nothing stored to reveal.
 */
export function ApiKeysCard() {
  const { user } = useAuth();
  const { data: keys = [] } = useApiKeys();
  const upsert = useUpsert<ApiKey>(Collections.apiKeys, { surfaceErrors: true });
  const del = useDelete(Collections.apiKeys);

  const [label, setLabel] = useState("");
  const [days, setDays] = useState("90");
  const [issued, setIssued] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user?.Role !== "Admin") return null;

  const create = async () => {
    const name = label.trim();
    if (!name) return toast.error("Give the key a label so you know what to revoke later.");
    const lifetime = Number(days);
    if (!Number.isFinite(lifetime) || lifetime <= 0) return toast.error("Expiry must be a number of days.");

    setBusy(true);
    try {
      const key = generateApiKey();
      const doc: ApiKey = {
        id: `apikey_${crypto.randomUUID().slice(0, 8)}`,
        Label: name,
        KeyHash: await hashApiKey(key),
        // First characters only, so a row in the list can be told apart from
        // another without storing anything that helps forge it.
        KeyPrefix: key.slice(0, 12),
        Role: "Viewer",
        CreatedBy: user?.Email ?? "",
        CreatedAt: new Date().toISOString(),
        ExpiresAt: new Date(Date.now() + lifetime * 86_400_000).toISOString(),
      };
      const saved = await upsert.mutateAsync(doc).catch(() => null);
      if (!saved) return; // useUpsert toasted the reason
      setIssued(key);
      setLabel("");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (k: ApiKey) => {
    if (!confirm(`Revoke "${k.Label}"? Any client using it stops working immediately.`)) return;
    await del.mutateAsync(k.id);
    toast.success(`Key "${k.Label}" revoked`);
  };

  return (
    <BentoCard>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" /> API Keys (MCP)
        </h2>
        <span className="text-[11px] text-muted-foreground">{keys.length} issued</span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">
        Read-only keys for pulling data into Claude via the MCP server. Endpoint:{" "}
        <code className="font-mono break-all">{MCP_ENDPOINT}</code>
      </p>

      {/* Shown once. Reloading the page loses it, which is the point. */}
      {issued && (
        <div className="mb-4 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-xs font-semibold text-foreground mb-2">
            Copy this key now — it is not stored and cannot be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-[11px] break-all text-primary">{issued}</code>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(issued);
                toast.success("Key copied");
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted/40"
            >
              <Copy className="h-3 w-3" /> Copy
            </button>
          </div>
          <button onClick={() => setIssued(null)} className="mt-2 text-[11px] text-muted-foreground hover:text-foreground">
            I've saved it — hide
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div className="flex-1 min-w-[10rem]">
          <Label className="text-xs">Label</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Aiman — Claude desktop" className="mt-1" />
        </div>
        <div className="w-28">
          <Label className="text-xs">Expires (days)</Label>
          <Input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" className="mt-1" />
        </div>
        <button
          onClick={create}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" /> Issue key
        </button>
      </div>

      <div className="space-y-2">
        {keys.map((k) => {
          const live = keyIsLive(k);
          return (
            <div key={k.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">{k.Label}</p>
                <p className="text-[11px] text-muted-foreground font-mono truncate">
                  {k.KeyPrefix}… · {k.Role}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {live ? `Expires ${k.ExpiresAt?.slice(0, 10)}` : "Expired"}
                  {k.LastUsedAt ? ` · last used ${k.LastUsedAt.slice(0, 10)}` : " · never used"}
                </p>
              </div>
              {!live && <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />}
              <button
                onClick={() => revoke(k)}
                className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 text-destructive px-2 py-1 text-xs hover:bg-destructive/10 shrink-0"
              >
                <Trash2 className="h-3 w-3" /> Revoke
              </button>
            </div>
          );
        })}
        {keys.length === 0 && (
          <p className="text-[11px] text-muted-foreground">No keys issued yet.</p>
        )}
      </div>
    </BentoCard>
  );
}
