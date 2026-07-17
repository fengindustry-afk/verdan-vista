import type { Group, UserProfile } from "./types";

/**
 * Access-group modules — the coarse feature areas a group can be granted.
 * Ids must match the table→module map in security/create-groups.sql; the DB
 * is the enforcement layer, this list only drives the admin UI and nav gating.
 */
export const MODULES = [
  { id: "custody", label: "Custody & Batches", description: "Feedstock sourcing, asset locations, geotagged photos" },
  { id: "biomass", label: "Biomass & MRV", description: "ESA satellite, ground truth and fused biomass data" },
  { id: "trees", label: "Trees & Scans", description: "Tree registry, readings, health scans, labels" },
  { id: "testing-plot", label: "Testing Plot", description: "Plot observations, applications, soil samples" },
  { id: "workflow", label: "Workflow & Readiness", description: "Work process entries, production readiness" },
  { id: "sensors", label: "Sensors (dMRV)", description: "Sensor devices and ingested readings" },
  { id: "cost-tracker", label: "Cost Tracker & Receipts", description: "Expenses, budgets, categories, digitised receipts" },
] as const;

export type ModuleId = (typeof MODULES)[number]["id"];

/**
 * Client-side mirror of public.can_access_module(): Admins always; users in
 * no group keep legacy full access; otherwise the union of their groups'
 * modules decides. UX-only — RLS enforces the same rule server-side.
 */
export function canAccessModule(
  user: UserProfile | null,
  groups: Group[],
  moduleId: string
): boolean {
  if (!user) return true; // route guards handle unauthenticated separately
  if (user.Role === "Admin") return true;
  const memberships = user.Groups ?? [];
  if (memberships.length === 0) return true;
  return groups.some((g) => memberships.includes(g.id) && g.Modules?.includes(moduleId));
}

/** Groups the user belongs to (in the order the groups list provides). */
export function groupsOf(user: UserProfile | null, groups: Group[]): Group[] {
  const memberships = user?.Groups ?? [];
  return groups.filter((g) => memberships.includes(g.id));
}

// ── Active group — which group gets stamped onto records the user creates ──
// Per-device choice (localStorage). Falls back to the user's first group.

const ACTIVE_GROUP_KEY = "ct_active_group";

export function storedActiveGroupId(): string | null {
  return localStorage.getItem(ACTIVE_GROUP_KEY);
}

export function setActiveGroupId(id: string | null): void {
  if (id) localStorage.setItem(ACTIVE_GROUP_KEY, id);
  else localStorage.removeItem(ACTIVE_GROUP_KEY);
}

/**
 * The group id to stamp onto newly created records: the stored choice when
 * it's still one of the user's groups, else their first group, else null
 * (record stays shared). Admins who belong to no group create shared records.
 */
export function activeGroupId(user: UserProfile | null): string | null {
  const memberships = user?.Groups ?? [];
  if (memberships.length === 0) return null;
  const stored = storedActiveGroupId();
  if (stored && memberships.includes(stored)) return stored;
  return memberships[0];
}
