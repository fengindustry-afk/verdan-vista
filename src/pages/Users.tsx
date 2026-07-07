import { BentoCard } from "@/components/BentoCard";
import { useUsers } from "@/hooks/useCollection";
import { parseRole, roleDisplayName, roleDescription, hasPermission, Permission, UserRole } from "@/lib/rbac";
import { Loader2, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { UserProfile } from "@/lib/types";
import { useMemo, useState } from "react";

// Human-readable permission labels for the detail view.
const PERMISSION_LABELS: [Permission, string][] = [
  [Permission.ViewDashboard, "View dashboard"],
  [Permission.ViewFeedstock, "View feedstock"],
  [Permission.AddFeedstock, "Add feedstock"],
  [Permission.EditFeedstock, "Edit feedstock"],
  [Permission.DeleteFeedstock, "Delete feedstock"],
  [Permission.VerifyFeedstock, "Verify feedstock"],
  [Permission.ViewLocations, "View locations"],
  [Permission.AddLocations, "Add locations"],
  [Permission.DeleteLocations, "Delete locations"],
  [Permission.ExportData, "Export data"],
  [Permission.ViewUsers, "View users"],
  [Permission.EditUsers, "Edit users"],
  [Permission.DeleteUsers, "Delete users"],
  [Permission.AssignRoles, "Assign roles"],
  [Permission.ManageSettings, "Manage settings"],
];

const roleBadge: Record<UserRole, string> = {
  [UserRole.Viewer]: "bg-muted text-muted-foreground border-border",
  [UserRole.Operator]: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  [UserRole.Manager]: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  [UserRole.Admin]: "bg-primary/15 text-primary border-primary/30",
};

export default function Users() {
  const { data: users = [], isLoading } = useUsers();
  const [selected, setSelected] = useState<UserProfile | null>(null);

  const counts = useMemo(() => {
    const c: Record<number, number> = {};
    users.forEach((u) => {
      const r = parseRole(u.Role);
      c[r] = (c[r] ?? 0) + 1;
    });
    return c;
  }, [users]);

  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-72 h-72 -top-36 right-10 animate-pulse-glow" />
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> User Management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Role-based access control across the team</p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[UserRole.Admin, UserRole.Manager, UserRole.Operator, UserRole.Viewer].map((role, i) => (
              <BentoCard key={role} delay={i * 0.06}>
                <p className="text-2xl font-bold text-foreground">{counts[role] ?? 0}</p>
                <p className="text-sm font-medium text-foreground mt-1">{roleDisplayName[role]}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{roleDescription[role]}</p>
              </BentoCard>
            ))}
          </div>

          <BentoCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">Company</TableHead>
                  <TableHead className="hidden lg:table-cell">Last Login</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const role = parseRole(u.Role);
                  const initials = (u.FullName || u.Email || "?")
                    .split(" ")
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase();
                  return (
                    <TableRow key={u.id} onClick={() => setSelected(u)} className="cursor-pointer">

                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/15 text-primary text-xs">{initials}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{u.FullName || "—"}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{u.Email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] border ${roleBadge[role]}`}>
                          {roleDisplayName[role]}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {u.CompanyName || "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {u.LastLoginAt ? new Date(u.LastLoginAt).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {users.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No users found.</p>}
          </BentoCard>
        </>
      )}

      {/* User detail */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          {selected && (() => {
            const role = parseRole(selected.Role);
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{selected.FullName || selected.Email}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary/15 text-primary">
                        {(selected.FullName || selected.Email || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <Badge variant="outline" className={`text-[10px] border ${roleBadge[role]}`}>{roleDisplayName[role]}</Badge>
                      <p className="text-[11px] text-muted-foreground mt-1">{roleDescription[role]}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Field k="Email" v={selected.Email} />
                    <Field k="Employee ID" v={selected.EmployeeId} />
                    <Field k="Job title" v={selected.JobTitle} />
                    <Field k="Department" v={selected.Department} />
                    <Field k="Company" v={selected.CompanyName} />
                    <Field k="Phone" v={selected.PhoneNumber} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-2">Permissions</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {PERMISSION_LABELS.filter(([p]) => hasPermission(role, p)).map(([p, label]) => (
                        <span key={p} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <CheckCircle2 className="h-3 w-3 text-primary" /> {label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Field = ({ k, v }: { k: string; v?: string }) => (
  <div>
    <p className="text-muted-foreground">{k}</p>
    <p className="text-foreground">{v || "—"}</p>
  </div>
);
