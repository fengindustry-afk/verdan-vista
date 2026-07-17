import { useAuth } from "@/lib/auth";
import { useGroups } from "@/hooks/useCollection";
import { canAccessModule } from "@/lib/groups";

/**
 * Predicate for access-group module gating in navigation: true when the
 * current user may open pages of `moduleId` (ungated when undefined).
 * UX-only — RLS enforces the same rule on the data itself.
 */
export function useModuleAccess(): (moduleId?: string) => boolean {
  const { user } = useAuth();
  const { data: groups = [] } = useGroups();
  return (moduleId?: string) => !moduleId || canAccessModule(user, groups, moduleId);
}
