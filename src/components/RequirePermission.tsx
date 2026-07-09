import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { routePermissions } from "@/lib/navigation";
import { Button } from "@/components/ui/button";

/**
 * Blocks a route when the current role lacks the permission mapped to its path
 * (see `routePermissions`). Sits inside RequireAuth, so a user is guaranteed to
 * be authenticated here — this only gates by role.
 *
 * ⚠️ UX-only: prevents a role from stumbling into a page they can't use. It is
 * NOT a security boundary — the data is protected by RLS regardless.
 */
export function RequirePermission({ children }: { children: ReactNode }) {
  const { role, user } = useAuth();
  const location = useLocation();

  // Match the current pathname against the route map. Static paths match
  // directly; the two known detail routes fall back to their parent section.
  const required =
    routePermissions[location.pathname] ??
    (location.pathname.startsWith("/feedstock/")
      ? routePermissions["/feedstock/:id"]
      : location.pathname.startsWith("/testing-plot/")
        ? routePermissions["/testing-plot/:id"]
        : undefined);

  if (required === undefined || hasPermission(role, required)) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <ShieldAlert className="h-10 w-10 text-muted-foreground" />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Access restricted</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your role ({user?.Role ?? "Viewer"}) doesn't have permission to view this page.
          Contact an administrator if you need access.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
