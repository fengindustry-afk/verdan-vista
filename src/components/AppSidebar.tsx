import { LayoutDashboard, Package, Workflow, Calculator, MapPin, Video, TreePine, ShieldCheck, Shield, FileText, Settings } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Feedstock", url: "/feedstock", icon: Package },
  { title: "Workflow", url: "/workflow", icon: Workflow },
  { title: "CORC Calculator", url: "/corc-calculator", icon: Calculator },
  { title: "Assets", url: "/assets", icon: MapPin },
  { title: "CCTV", url: "/cctv", icon: Video },
  { title: "Testing Plot", url: "/testing-plot", icon: TreePine },
  { title: "Users", url: "/users", icon: ShieldCheck },
  { title: "Reports", url: "/reports", icon: FileText },
  { title: "Audit Trail", url: "/audit-trail", icon: Shield },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <SidebarContent className="pt-4">
        <div className="flex items-center gap-2.5 px-4 pb-6">
          <img src="/esterra-mark.svg" alt="Esterra" className="h-8 w-8 shrink-0" />
          {!collapsed && (
            <span className="text-sm font-light tracking-[0.28em] text-foreground">
              EST<span className="text-primary">E</span>RRA
            </span>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const active = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                          active
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                        activeClassName=""
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
