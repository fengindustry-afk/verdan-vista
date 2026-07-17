import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { navSections, sectionForPath } from "@/lib/navigation";
import { GlobalSearch } from "@/components/GlobalSearch";
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

export function AppSidebar() {
  const { state, isMobile, setOpen, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { role } = useAuth();
  const canModule = useModuleAccess();
  // A section is shown when the role (and access groups) can reach at least
  // one of its child pages.
  const visibleSections = navSections.filter((section) =>
    section.children.some((c) => hasPermission(role, c.permission) && canModule(c.module))
  );
  const activeSection = sectionForPath(location.pathname);

  // Collapse the menu after a selection: close the sheet on mobile, collapse the
  // rail to icons on desktop.
  const handleNavigate = () => {
    if (isMobile) setOpenMobile(false);
    else setOpen(false);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border/50">
      <SidebarContent className="pt-4">
        <div className="flex items-center gap-2.5 px-4 pb-6">
          <img src="/esterra-mark.svg" alt="Esterra" className="h-8 w-8 shrink-0" />
          {!collapsed && (
            <span className="text-sm font-light tracking-[0.28em] text-sidebar-accent-foreground">
              EST<span className="text-primary">E</span>RRA
            </span>
          )}
        </div>

        {/* Global search — full field when expanded, an icon that opens the rail when collapsed. */}
        <div className="px-2 pb-3">
          {collapsed ? (
            <button
              onClick={() => (isMobile ? setOpenMobile(true) : setOpen(true))}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors mx-auto"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </button>
          ) : (
            <GlobalSearch className="w-full" panelClassName="min-w-[20rem]" />
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleSections.map((section) => {
                const active = activeSection?.title === section.title;
                return (
                  <SidebarMenuItem key={section.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={section.url}
                        onClick={handleNavigate}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                          active
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        }`}
                        activeClassName=""
                      >
                        <section.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>{section.title}</span>}
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
