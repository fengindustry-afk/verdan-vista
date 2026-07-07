/** Small presentation helpers shared across pages. */

export const statusBadgeClass: Record<string, string> = {
  verified: "bg-primary/15 text-primary border-primary/30",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
};

export function badgeForStatus(status?: string): string {
  return statusBadgeClass[(status ?? "").toLowerCase()] ??
    "bg-muted text-muted-foreground border-border";
}

export function fmt(n: number, digits = 0): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
