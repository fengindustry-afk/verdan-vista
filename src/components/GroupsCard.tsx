import { useState } from "react";
import { toast } from "sonner";
import { UsersRound, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { BentoCard } from "@/components/BentoCard";
import { useAuth } from "@/lib/auth";
import { useGroups, useUsers, useUpsert, useDelete } from "@/hooks/useCollection";
import { Collections } from "@/lib/collections";
import { MODULES, groupsOf, activeGroupId, setActiveGroupId } from "@/lib/groups";
import type { Group, UserProfile } from "@/lib/types";

/**
 * Settings ▸ Groups & Access.
 * Admins: create/edit/delete access groups (name + module grants) and assign
 * members (writes the Groups array on each user's profile row). Everyone with
 * a membership: see their groups and pick the "active" one stamped onto new
 * records. Enforcement is RLS (security/create-groups.sql) — this is the UI.
 */
export function GroupsCard() {
  const { user } = useAuth();
  const { data: groups = [] } = useGroups();
  const { data: users = [] } = useUsers();
  const upsertGroup = useUpsert<Group>(Collections.groups, { surfaceErrors: true });
  const deleteGroup = useDelete(Collections.groups);
  // Membership changes are security-relevant — keep them in the audit trail.
  const upsertUser = useUpsert<UserProfile>(Collections.users);

  const isAdmin = user?.Role === "Admin";
  const myGroups = groupsOf(user, groups);
  const [active, setActive] = useState(() => activeGroupId(user));

  // Inline editor state (create when `editing.id` is empty).
  const [editing, setEditing] = useState<{ id: string; name: string; modules: string[] } | null>(null);

  if (!isAdmin && myGroups.length === 0) return null;

  const memberEmails = (g: Group) =>
    users.filter((u) => (u.Groups ?? []).includes(g.id));

  const saveGroup = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) {
      toast.error("Enter a group name.");
      return;
    }
    const doc: Group = {
      id: editing.id || `group_${crypto.randomUUID().slice(0, 8)}`,
      Name: name,
      Modules: editing.modules,
    };
    try {
      await upsertGroup.mutateAsync(doc);
      toast.success(`Group "${name}" saved`);
      setEditing(null);
    } catch {
      /* useUpsert already toasts the RLS/table error */
    }
  };

  const removeGroup = async (g: Group) => {
    // Detach members first so no profile points at a dead group id.
    for (const u of memberEmails(g)) {
      await upsertUser.mutateAsync({ ...u, Groups: (u.Groups ?? []).filter((id) => id !== g.id) });
    }
    await deleteGroup.mutateAsync(g.id);
    toast.success(`Group "${g.Name}" deleted`);
  };

  const toggleMember = async (g: Group, u: UserProfile) => {
    const current = u.Groups ?? [];
    const next = current.includes(g.id)
      ? current.filter((id) => id !== g.id)
      : [...current, g.id];
    await upsertUser.mutateAsync({ ...u, Groups: next });
  };

  const toggleModule = (moduleId: string) => {
    if (!editing) return;
    setEditing({
      ...editing,
      modules: editing.modules.includes(moduleId)
        ? editing.modules.filter((m) => m !== moduleId)
        : [...editing.modules, moduleId],
    });
  };

  return (
    <BentoCard>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <UsersRound className="h-4 w-4 text-primary" /> Groups &amp; Access
        </h3>
        {isAdmin && !editing && (
          <button
            onClick={() => setEditing({ id: "", name: "", modules: [] })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors"
          >
            <Plus className="h-3.5 w-3.5 text-primary" /> New group
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">
        Groups control which modules members can open and which records they can see.
        Users in no group see everything (legacy); records without a group are shared.
      </p>

      {/* Active-group picker: which group new records are stamped with. */}
      {myGroups.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">New records belong to</span>
          <select
            value={active ?? ""}
            onChange={(e) => {
              setActiveGroupId(e.target.value || null);
              setActive(e.target.value || null);
            }}
            className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
          >
            {myGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.Name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Group list */}
      <div className="space-y-3">
        {groups.length === 0 && !editing && (
          <p className="text-xs text-muted-foreground">
            No groups yet{isAdmin ? " — create one to start scoping access." : "."}
          </p>
        )}
        {groups.map((g) => (
          <div key={g.id} className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">{g.Name}</span>
              {isAdmin && (
                <span className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing({ id: g.id, name: g.Name, modules: g.Modules ?? [] })}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                    aria-label={`Edit ${g.Name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => void removeGroup(g)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    aria-label={`Delete ${g.Name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(g.Modules ?? []).length === 0 && (
                <span className="text-[11px] text-amber-400">No modules — members of only this group see nothing</span>
              )}
              {(g.Modules ?? []).map((m) => (
                <span key={m} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                  {MODULES.find((x) => x.id === m)?.label ?? m}
                </span>
              ))}
            </div>
            {isAdmin && (
              <div className="mt-3 border-t border-border/60 pt-2">
                <p className="text-[11px] text-muted-foreground mb-1.5">Members</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {users.map((u) => {
                    const member = (u.Groups ?? []).includes(g.id);
                    return (
                      <label key={u.id} className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={member}
                          onChange={() => void toggleMember(g, u)}
                          className="accent-[hsl(var(--primary))]"
                        />
                        {u.FullName || u.Email}
                      </label>
                    );
                  })}
                  {users.length === 0 && <span className="text-[11px] text-muted-foreground">No user profiles loaded.</span>}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Inline create/edit form */}
        {editing && (
          <div className="rounded-xl border border-primary/50 p-3 space-y-3">
            <input
              autoFocus
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="Group name (e.g. Finance, Field Ops)"
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            />
            <div className="grid sm:grid-cols-2 gap-1.5">
              {MODULES.map((m) => (
                <label key={m.id} className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editing.modules.includes(m.id)}
                    onChange={() => toggleModule(m.id)}
                    className="mt-0.5 accent-[hsl(var(--primary))]"
                  />
                  <span>
                    {m.label}
                    <span className="block text-[10px] text-muted-foreground">{m.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void saveGroup()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Check className="h-3.5 w-3.5" /> Save group
              </button>
              <button
                onClick={() => setEditing(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </BentoCard>
  );
}
