import { LayoutDashboard, Activity, Package, Workflow, Calculator, MapPin, Video, TreePine, Wallet, ShieldCheck, Shield, FileText, Settings, type LucideIcon } from "lucide-react";
import { Permission } from "./rbac";

/**
 * Single source of truth for the app's navigation and the permission each
 * destination requires. Consumed by the sidebar (top-level sections), the
 * in-page section tab bar (children), and the route guards.
 *
 * The nav is two levels: four top-level SECTIONS in the sidebar, each with a set
 * of child pages surfaced as a pill tab bar inside the section (see SectionNav).
 * Every child keeps its own route, so deep links / detail pages / search all work.
 *
 * ⚠️ These are UX-only gates — the client role is user-influenceable. Real
 * enforcement is Row-Level Security in the database (see security/rls.sql).
 */
export interface NavChild {
  title: string;
  url: string;
  icon: LucideIcon;
  permission: Permission;
  /** Sub-item of the child immediately above it (rendered indented in the bar). */
  nested?: boolean;
}

export interface NavSection {
  title: string;
  /** Where the sidebar entry navigates (its primary child). */
  url: string;
  icon: LucideIcon;
  children: NavChild[];
}

export const navSections: NavSection[] = [
  {
    title: "Dashboard", url: "/", icon: LayoutDashboard,
    children: [
      { title: "Overview", url: "/", icon: LayoutDashboard, permission: Permission.ViewDashboard },
      { title: "dMRV Monitor", url: "/dmrv", icon: Activity, permission: Permission.ViewDashboard },
      { title: "CORC Calculator", url: "/corc-calculator", icon: Calculator, permission: Permission.ViewDashboard },
    ],
  },
  {
    title: "Workflow", url: "/workflow", icon: Workflow,
    children: [
      { title: "Workflow", url: "/workflow", icon: Workflow, permission: Permission.ViewFeedstock },
      { title: "Feedstock", url: "/feedstock", icon: Package, permission: Permission.ViewFeedstock },
      { title: "Testing Plot", url: "/testing-plot", icon: TreePine, permission: Permission.ViewLocations },
      { title: "Cost Tracker", url: "/cost-tracker", icon: Wallet, permission: Permission.ViewCosts },
    ],
  },
  {
    title: "Reports", url: "/reports", icon: FileText,
    children: [
      { title: "Reports", url: "/reports", icon: FileText, permission: Permission.ViewDashboard },
      { title: "Audit Trail", url: "/audit-trail", icon: Shield, permission: Permission.ViewUsers },
    ],
  },
  {
    title: "Settings", url: "/settings", icon: Settings,
    children: [
      { title: "Settings", url: "/settings", icon: Settings, permission: Permission.ViewSettings },
      { title: "Assets", url: "/assets", icon: MapPin, permission: Permission.ViewLocations },
      { title: "CCTV", url: "/cctv", icon: Video, permission: Permission.ViewLocations, nested: true },
      { title: "Users", url: "/users", icon: ShieldCheck, permission: Permission.ViewUsers },
    ],
  },
];

/** True when `pathname` is within a child's route (exact, or a detail sub-route). */
export function isChildActive(pathname: string, url: string): boolean {
  return url === "/" ? pathname === "/" : pathname === url || pathname.startsWith(url + "/");
}

/** The section that owns the current path (longest matching child route wins). */
export function sectionForPath(pathname: string): NavSection | undefined {
  let best: { section: NavSection; len: number } | undefined;
  for (const section of navSections) {
    for (const child of section.children) {
      if (isChildActive(pathname, child.url) && (!best || child.url.length > best.len)) {
        best = { section, len: child.url.length };
      }
    }
  }
  return best?.section;
}

/**
 * Permission required to open each route path. Detail routes inherit their
 * parent section's permission. Paths absent from this map are unguarded.
 */
export const routePermissions: Record<string, Permission> = {
  "/": Permission.ViewDashboard,
  "/dmrv": Permission.ViewDashboard,
  "/feedstock": Permission.ViewFeedstock,
  "/feedstock/:id": Permission.ViewFeedstock,
  "/workflow": Permission.ViewFeedstock,
  "/corc-calculator": Permission.ViewDashboard,
  "/assets": Permission.ViewLocations,
  "/cctv": Permission.ViewLocations,
  "/testing-plot": Permission.ViewLocations,
  "/testing-plot/:id": Permission.ViewLocations,
  "/cost-tracker": Permission.ViewCosts,
  "/receipts": Permission.ViewCosts,
  "/users": Permission.ViewUsers,
  "/reports": Permission.ViewDashboard,
  "/audit-trail": Permission.ViewUsers,
  "/settings": Permission.ViewSettings,
};
