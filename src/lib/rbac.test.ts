import { describe, it, expect } from "vitest";
import { UserRole, Permission, hasPermission, parseRole } from "./rbac";

describe("hasPermission", () => {
  it("grants Viewers read-only access", () => {
    expect(hasPermission(UserRole.Viewer, Permission.ViewFeedstock)).toBe(true);
    expect(hasPermission(UserRole.Viewer, Permission.AddFeedstock)).toBe(false);
    expect(hasPermission(UserRole.Viewer, Permission.VerifyFeedstock)).toBe(false);
  });

  it("lets Operators add/edit but not verify or export", () => {
    expect(hasPermission(UserRole.Operator, Permission.AddFeedstock)).toBe(true);
    expect(hasPermission(UserRole.Operator, Permission.EditFeedstock)).toBe(true);
    expect(hasPermission(UserRole.Operator, Permission.VerifyFeedstock)).toBe(false);
    expect(hasPermission(UserRole.Operator, Permission.ExportData)).toBe(false);
  });

  it("lets Managers verify and export", () => {
    expect(hasPermission(UserRole.Manager, Permission.VerifyFeedstock)).toBe(true);
    expect(hasPermission(UserRole.Manager, Permission.ExportData)).toBe(true);
    expect(hasPermission(UserRole.Manager, Permission.AssignRoles)).toBe(false);
  });

  it("grants Admins full access including role assignment", () => {
    expect(hasPermission(UserRole.Admin, Permission.AssignRoles)).toBe(true);
    expect(hasPermission(UserRole.Admin, Permission.DeleteUsers)).toBe(true);
  });
});

describe("parseRole", () => {
  it("parses role name strings (backend format)", () => {
    expect(parseRole("Admin")).toBe(UserRole.Admin);
    expect(parseRole("operator")).toBe(UserRole.Operator);
    expect(parseRole("Administrator")).toBe(UserRole.Admin);
  });
  it("falls back to Viewer for unknown/empty values", () => {
    expect(parseRole(undefined)).toBe(UserRole.Viewer);
    expect(parseRole("nonsense")).toBe(UserRole.Viewer);
  });
  it("passes numeric roles through", () => {
    expect(parseRole(3)).toBe(UserRole.Admin);
  });
});
