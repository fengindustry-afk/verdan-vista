/**
 * Role-Based Access Control, mirroring the .NET `Models/Role.cs` +
 * `RolePermissions`. Roles are hierarchical; permissions are bit flags.
 *
 * ⚠️ SECURITY: these checks are for UX only (hiding buttons a role can't use).
 * They are NOT a security boundary — the client role comes from the session and
 * is user-influenceable. Real enforcement lives in the database via Row-Level
 * Security (see security/rls.sql), which rejects unauthorized reads/writes
 * regardless of what the client claims.
 */

export enum UserRole {
  Viewer = 0,
  Operator = 1,
  Manager = 2,
  Admin = 3,
}

export enum Permission {
  None = 0,
  ViewFeedstock = 1 << 0,
  AddFeedstock = 1 << 1,
  EditFeedstock = 1 << 2,
  DeleteFeedstock = 1 << 3,
  VerifyFeedstock = 1 << 4,
  ViewLocations = 1 << 5,
  AddLocations = 1 << 6,
  DeleteLocations = 1 << 7,
  ExportData = 1 << 8,
  ImportData = 1 << 9,
  ClearCache = 1 << 10,
  ViewUsers = 1 << 11,
  EditUsers = 1 << 12,
  DeleteUsers = 1 << 13,
  AssignRoles = 1 << 14,
  ViewDashboard = 1 << 15,
  ViewSettings = 1 << 16,
  ManageSettings = 1 << 17,
}

const P = Permission;

export function defaultPermissions(role: UserRole): number {
  switch (role) {
    case UserRole.Viewer:
      return P.ViewDashboard | P.ViewFeedstock | P.ViewLocations | P.ViewSettings;
    case UserRole.Operator:
      return (
        P.ViewDashboard | P.ViewSettings | P.ViewFeedstock | P.AddFeedstock |
        P.EditFeedstock | P.ViewLocations | P.AddLocations
      );
    case UserRole.Manager:
      return (
        P.ViewDashboard | P.ViewSettings | P.ManageSettings | P.ViewFeedstock |
        P.AddFeedstock | P.EditFeedstock | P.DeleteFeedstock | P.VerifyFeedstock |
        P.ViewLocations | P.AddLocations | P.DeleteLocations | P.ExportData |
        P.ClearCache | P.ViewUsers
      );
    case UserRole.Admin:
      return (
        P.ViewDashboard | P.ViewSettings | P.ManageSettings | P.ViewFeedstock |
        P.AddFeedstock | P.EditFeedstock | P.DeleteFeedstock | P.VerifyFeedstock |
        P.ViewLocations | P.AddLocations | P.DeleteLocations | P.ExportData |
        P.ImportData | P.ClearCache | P.ViewUsers | P.EditUsers | P.DeleteUsers |
        P.AssignRoles
      );
    default:
      return P.None;
  }
}

export function hasPermission(role: UserRole, perm: Permission, custom = 0): boolean {
  const effective = custom || defaultPermissions(role);
  return (effective & perm) === perm;
}

export const roleDisplayName: Record<UserRole, string> = {
  [UserRole.Viewer]: "Viewer",
  [UserRole.Operator]: "Operator",
  [UserRole.Manager]: "Manager",
  [UserRole.Admin]: "Administrator",
};

/** Parse the role as stored in the backend (the enum *name* string, or a number). */
export function parseRole(value: string | number | undefined): UserRole {
  if (typeof value === "number") return value as UserRole;
  switch ((value ?? "").toString().toLowerCase()) {
    case "operator":
      return UserRole.Operator;
    case "manager":
      return UserRole.Manager;
    case "admin":
    case "administrator":
      return UserRole.Admin;
    default:
      return UserRole.Viewer;
  }
}

export const roleDescription: Record<UserRole, string> = {
  [UserRole.Viewer]: "Read-only access to view data",
  [UserRole.Operator]: "Can add and edit feedstock and locations",
  [UserRole.Manager]: "Can verify items, manage team data, and export",
  [UserRole.Admin]: "Full system access including user management",
};
