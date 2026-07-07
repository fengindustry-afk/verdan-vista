import { BentoCard } from "@/components/BentoCard";
import { useUsers } from "@/hooks/useCollection";
import { parseRole, roleDisplayName, roleDescription, UserRole } from "@/lib/rbac";
import { Loader2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMemo } from "react";

const roleBadge: Record<UserRole, string> = {
  [UserRole.Viewer]: "bg-muted text-muted-foreground border-border",
  [UserRole.Operator]: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  [UserRole.Manager]: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  [UserRole.Admin]: "bg-primary/15 text-primary border-primary/30",
};

export default function Users() {
  const { data: users = [], isLoading } = useUsers();

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
                    <TableRow key={u.id}>
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
    </div>
  );
}
