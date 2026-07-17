import { Link, useLocation } from "react-router-dom";
import { CornerDownRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { sectionForPath, isChildActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * The in-page secondary navigation: a horizontal pill bar of the active
 * section's child pages (e.g. under Workflow → Feedstock · Testing Plot · Cost
 * Tracker · Receipts). Rendered once in AppLayout above the routed page, so it
 * appears automatically on every page and reflects the section you're in —
 * including detail routes (a batch page still shows the Workflow bar).
 *
 * Hidden when the current section exposes one or fewer children to this role,
 * since there'd be nothing to switch between.
 */
export function SectionNav() {
  const location = useLocation();
  const { role } = useAuth();
  const canModule = useModuleAccess();

  const section = sectionForPath(location.pathname);
  if (!section) return null;

  const items = section.children.filter(
    (c) => hasPermission(role, c.permission) && canModule(c.module)
  );
  if (items.length <= 1) return null;

  return (
    <nav className="border-b border-border/30 px-4 lg:px-6" aria-label={`${section.title} sections`}>
      <div className="flex items-center gap-1 overflow-x-auto py-2">
        {items.map((child) => {
          const active = isChildActive(location.pathname, child.url);
          const Icon = child.icon;
          return (
            <Link
              key={child.url}
              to={child.url}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                child.nested && "ml-0.5",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {child.nested && <CornerDownRight className="h-3 w-3 opacity-50" />}
              <Icon className="h-3.5 w-3.5" />
              {child.title}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
