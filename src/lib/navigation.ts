import { LayoutDashboard, Package, Workflow, Calculator, MapPin, Video, TreePine, Wallet, ShieldCheck, Shield, FileText, Settings, type LucideIcon } from "lucide-react";
import { Permission } from "./rbac";

/**
 * Single source of truth for the app's primary navigation and the permission
 * each destination requires. Consumed by both the sidebar (to hide links a role
 * can't use) and the route guards (to block direct URL access).
 *
 * ⚠️ These are UX-only gates — the client role is user-influenceable. Real
 * enforcement is Row-Level Security in the database (see security/rls.sql).
 */
export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  permission: Permission;
}

export const navItems: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, permission: Permission.ViewDashboard },
  { title: "Feedstock", url: "/feedstock", icon: Package, permission: Permission.ViewFeedstock },
  { title: "Workflow", url: "/workflow", icon: Workflow, permission: Permission.ViewFeedstock },
  { title: "CORC Calculator", url: "/corc-calculator", icon: Calculator, permission: Permission.ViewDashboard },
  { title: "Assets", url: "/assets", icon: MapPin, permission: Permission.ViewLocations },
  { title: "CCTV", url: "/cctv", icon: Video, permission: Permission.ViewLocations },
  { title: "Testing Plot", url: "/testing-plot", icon: TreePine, permission: Permission.ViewLocations },
  { title: "Cost Tracker", url: "/cost-tracker", icon: Wallet, permission: Permission.ViewCosts },
  { title: "Users", url: "/users", icon: ShieldCheck, permission: Permission.ViewUsers },
  { title: "Reports", url: "/reports", icon: FileText, permission: Permission.ViewDashboard },
  { title: "Audit Trail", url: "/audit-trail", icon: Shield, permission: Permission.ViewUsers },
  { title: "Settings", url: "/settings", icon: Settings, permission: Permission.ViewSettings },
];

/**
 * Permission required to open each route path. Detail routes inherit their
 * parent section's permission. Paths absent from this map are unguarded.
 */
export const routePermissions: Record<string, Permission> = {
  "/": Permission.ViewDashboard,
  "/feedstock": Permission.ViewFeedstock,
  "/feedstock/:id": Permission.ViewFeedstock,
  "/workflow": Permission.ViewFeedstock,
  "/corc-calculator": Permission.ViewDashboard,
  "/assets": Permission.ViewLocations,
  "/cctv": Permission.ViewLocations,
  "/testing-plot": Permission.ViewLocations,
  "/testing-plot/:id": Permission.ViewLocations,
  "/cost-tracker": Permission.ViewCosts,
  "/users": Permission.ViewUsers,
  "/reports": Permission.ViewDashboard,
  "/audit-trail": Permission.ViewUsers,
  "/settings": Permission.ViewSettings,
};
