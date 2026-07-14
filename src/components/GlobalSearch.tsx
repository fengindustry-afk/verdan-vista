import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Loader2, CornerDownLeft, type LucideIcon } from "lucide-react";
import {
  Package, Workflow as WorkflowIcon, Trees, Wallet, ReceiptText, MapPin, Users,
  FlaskConical, Eye, PackageCheck, ClipboardCheck, PiggyBank, Compass,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  useFeedstock, useWorkProcessEntries, useTrees, useCostEntries,
  useReceipts, useLocations, useUsers, useSoilSamples, usePlotObservations,
  usePlotApplications, useReadinessStatus, useCostBudgets,
} from "@/hooks/useCollection";
import { entryTitle, entrySubtitle } from "@/lib/workProcess";
import { navSections } from "@/lib/navigation";
import { PLOT_SECTIONS } from "@/lib/testingPlotSections";
import { READINESS_CATALOG } from "@/lib/readiness";
import { useAuth } from "@/lib/auth";
import { hasPermission, Permission } from "@/lib/rbac";

/** Static navigable destinations — pages and in-page tabs — so search reaches
 *  every section, not just record data. Each is permission-gated below. */
interface PageEntry {
  title: string;
  subtitle: string;
  to: string;
  keywords: string;
  permission: Permission;
  icon: LucideIcon;
}

function buildPageEntries(): PageEntry[] {
  // Top-level pages come straight from the nav (deduped by url).
  const seen = new Set<string>();
  const pages: PageEntry[] = [];
  for (const s of navSections) {
    for (const c of s.children) {
      if (seen.has(c.url)) continue;
      seen.add(c.url);
      pages.push({
        title: c.title,
        subtitle: c.title === s.title ? "Page" : `${s.title} · Page`,
        to: c.url,
        keywords: `${c.title} ${s.title}`,
        permission: c.permission,
        icon: c.icon,
      });
    }
  }
  // In-page tabs that aren't their own route — deep-linked via query params.
  pages.push(
    { title: "Work Process", subtitle: "Workflow · Tab", to: "/workflow?tab=work-process", keywords: "work process stages entries data collection", permission: Permission.ViewFeedstock, icon: WorkflowIcon },
    { title: "Readiness", subtitle: "Workflow · Tab", to: "/workflow?tab=readiness", keywords: "readiness production checklist tasks manpower feedstock logistics utility operation", permission: Permission.ViewFeedstock, icon: ClipboardCheck },
    { title: "Custody", subtitle: "Workflow · Tab", to: "/workflow?tab=custody", keywords: "custody chain of custody stages batches lifecycle", permission: Permission.ViewFeedstock, icon: Compass },
  );
  for (const sec of PLOT_SECTIONS) {
    pages.push({
      title: `Section ${sec.letter} — ${sec.title}`,
      subtitle: "Testing Plot · Tab",
      to: `/testing-plot?section=${sec.key}`,
      keywords: `${sec.title} ${sec.titleBm} section ${sec.letter} testing plot`,
      permission: Permission.ViewLocations,
      icon: sec.icon,
    });
  }
  return pages;
}

/** One flattened, navigable hit from any collection. */
interface Hit {
  key: string;
  group: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  to: string;
  haystack: string;
}

/** Lowercased join of the truthy parts, used for substring matching. */
function hay(...parts: (string | number | null | undefined)[]): string {
  return parts.filter((p) => p !== null && p !== undefined && p !== "").join(" ").toLowerCase();
}

/**
 * App-wide search: indexes the main collections into a single list and
 * deep-links each match to its page. Purely client-side over already-cached
 * data, so it stays instant as you type.
 */
export function GlobalSearch({
  className = "w-full max-w-2xl",
  panelClassName = "",
}: {
  /** Wrapper width/positioning. Defaults to a centered, page-width bar. */
  className?: string;
  /** Extra classes for the results dropdown (e.g. a min-width in a narrow rail). */
  panelClassName?: string;
} = {}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const { role } = useAuth();
  const feedstock = useFeedstock();
  const workProcess = useWorkProcessEntries();
  const trees = useTrees();
  const costs = useCostEntries();
  const receipts = useReceipts();
  const locations = useLocations();
  const users = useUsers();
  const soilSamples = useSoilSamples();
  const observations = usePlotObservations();
  const applications = usePlotApplications();
  const readiness = useReadinessStatus();
  const budgets = useCostBudgets();

  const isLoading =
    feedstock.isLoading || workProcess.isLoading || trees.isLoading ||
    costs.isLoading || receipts.isLoading || locations.isLoading || users.isLoading ||
    soilSamples.isLoading || observations.isLoading || applications.isLoading ||
    readiness.isLoading || budgets.isLoading;

  // Build the flat index once per data change (not per keystroke).
  const index = useMemo<Hit[]>(() => {
    const hits: Hit[] = [];

    // Pages & tabs — every navigable destination the role can access.
    for (const p of buildPageEntries()) {
      if (!hasPermission(role, p.permission)) continue;
      hits.push({
        key: `page:${p.to}`,
        group: "Pages",
        icon: p.icon,
        title: p.title,
        subtitle: p.subtitle,
        to: p.to,
        haystack: hay(p.title, p.subtitle, p.keywords, p.to),
      });
    }

    for (const f of feedstock.data ?? []) {
      hits.push({
        key: `feedstock:${f.id}`,
        group: "Feedstock",
        icon: Package,
        title: f.Title || "Untitled batch",
        subtitle: [f.Type, f.Supplier, f.CurrentStage, f.Status].filter(Boolean).join(" · "),
        to: `/feedstock/${encodeURIComponent(f.id)}`,
        haystack: hay(f.Title, f.Type, f.Supplier, f.CurrentStage, f.Status, f.Amount, f.id),
      });
    }

    for (const e of workProcess.data ?? []) {
      hits.push({
        key: `wp:${e.id}`,
        group: "Work Process",
        icon: WorkflowIcon,
        title: entryTitle(e),
        subtitle: [e.StageTitle, entrySubtitle(e)].filter(Boolean).join(" · "),
        to: "/workflow",
        haystack: hay(e.StageTitle, entryTitle(e), entrySubtitle(e), ...Object.values(e.Values ?? {})),
      });
    }

    for (const t of trees.data ?? []) {
      hits.push({
        key: `tree:${t.id}`,
        group: "Testing Plot",
        icon: Trees,
        title: t.TreeCode || "Tree",
        subtitle: [t.Species, t.PlotName, t.TreatmentGroup].filter(Boolean).join(" · "),
        to: `/testing-plot/${encodeURIComponent(t.id)}`,
        haystack: hay(t.TreeCode, t.Species, t.PlotName, t.TreatmentGroup, t.Treatment, t.Notes),
      });
    }

    for (const c of costs.data ?? []) {
      hits.push({
        key: `cost:${c.id}`,
        group: "Cost Tracker",
        icon: Wallet,
        title: c.Title || "Cost entry",
        subtitle: [c.Category, c.Date, c.Note].filter(Boolean).join(" · "),
        to: "/cost-tracker",
        haystack: hay(c.Title, c.Category, c.Note, c.CreatedBy, c.Amount, c.Date),
      });
    }

    for (const r of receipts.data ?? []) {
      const label = r.Merchant || r.ReceiptNo || "Receipt";
      hits.push({
        key: `receipt:${r.id}`,
        group: "Receipts",
        icon: ReceiptText,
        title: label,
        subtitle: [r.ReceiptNo, r.Category, r.Date].filter(Boolean).join(" · "),
        to: "/cost-tracker?tab=receipts",
        haystack: hay(r.Merchant, r.ReceiptNo, r.Category, r.Notes, r.MerchantTin, r.Date, r.Total),
      });
    }

    for (const l of locations.data ?? []) {
      hits.push({
        key: `loc:${l.id}`,
        group: "Assets",
        icon: MapPin,
        title: l.Name || "Location",
        subtitle: [l.SiteType, l.Notes].filter(Boolean).join(" · "),
        to: "/assets",
        haystack: hay(l.Name, l.SiteType, l.Notes, l.CapturedBy, l.Latitude, l.Longitude),
      });
    }

    for (const u of users.data ?? []) {
      hits.push({
        key: `user:${u.id}`,
        group: "Users",
        icon: Users,
        title: u.FullName || u.Email || "User",
        subtitle: [u.Role, u.JobTitle, u.Department, u.Email].filter(Boolean).join(" · "),
        to: "/users",
        haystack: hay(u.FullName, u.Email, u.Role, u.JobTitle, u.Department, u.CompanyName, u.EmployeeId),
      });
    }

    // Testing Plot · Section E — soil analysis samples.
    for (const s of soilSamples.data ?? []) {
      hits.push({
        key: `soil:${s.id}`,
        group: "Soil Analysis",
        icon: FlaskConical,
        title: s.Parameter || "Soil sample",
        subtitle: [s.TreatmentGroup, s.Date, s.Note].filter(Boolean).join(" · "),
        to: "/testing-plot?section=E",
        haystack: hay(s.Parameter, s.TreatmentGroup, s.Note, s.Date, s.InitialReading, s.FinalReading),
      });
    }

    // Testing Plot · Section F — visual observations.
    for (const o of observations.data ?? []) {
      hits.push({
        key: `obs:${o.id}`,
        group: "Observations",
        icon: Eye,
        title: [o.Date, o.TreatmentGroup].filter(Boolean).join(" · ") || "Observation",
        subtitle: [o.LeafCondition, o.StemCondition, o.SoilCondition, o.Notes].filter(Boolean).join(" · "),
        to: "/testing-plot?section=F",
        haystack: hay(o.Date, o.TreatmentGroup, o.LeafCondition, o.StemCondition, o.SoilCondition, o.Notes, o.RecordedBy),
      });
    }

    // Testing Plot · Section H — product applications.
    for (const a of applications.data ?? []) {
      hits.push({
        key: `app:${a.id}`,
        group: "Applications",
        icon: PackageCheck,
        title: a.Product || "Product application",
        subtitle: [a.Method, a.Date, a.Officer].filter(Boolean).join(" · "),
        to: "/testing-plot?section=H",
        haystack: hay(a.Product, a.Method, a.Officer, a.Supervisor, a.Notes, a.Date, a.RatePerTreeKg),
      });
    }

    // Workflow · Readiness — catalog + custom tasks that have a status row.
    for (const r of readiness.data ?? []) {
      if (!r.Label) continue; // catalog activities without custom labels aren't self-descriptive
      hits.push({
        key: `readiness:${r.id}`,
        group: "Readiness",
        icon: ClipboardCheck,
        title: r.Label,
        subtitle: [r.PIC, r.Status?.replace("_", " ")].filter(Boolean).join(" · "),
        to: "/workflow?tab=readiness",
        haystack: hay(r.Label, r.PIC, r.Status, r.Note),
      });
    }

    // Workflow · Readiness — the static activity catalog (searchable by label / PIC).
    for (const cat of READINESS_CATALOG) {
      for (const section of cat.Sections) {
        for (const act of section.Activities) {
          hits.push({
            key: `readiness-cat:${act.Key}`,
            group: "Readiness",
            icon: ClipboardCheck,
            title: act.Label,
            subtitle: [cat.Title, section.Title, act.PIC].filter(Boolean).join(" · "),
            to: "/workflow?tab=readiness",
            haystack: hay(act.Label, act.PIC, cat.Title, section.Title, ...Object.values(act.Attrs)),
          });
        }
      }
    }

    // Cost Tracker — category budgets.
    for (const b of budgets.data ?? []) {
      hits.push({
        key: `budget:${b.id}`,
        group: "Budgets",
        icon: PiggyBank,
        title: b.Category || "Budget",
        subtitle: `Monthly limit · ${b.MonthlyLimit}`,
        to: "/cost-tracker",
        haystack: hay(b.Category, b.MonthlyLimit),
      });
    }

    return hits;
  }, [
    role, feedstock.data, workProcess.data, trees.data, costs.data, receipts.data,
    locations.data, users.data, soilSamples.data, observations.data,
    applications.data, readiness.data, budgets.data,
  ]);

  // Match on every whitespace-separated token (AND). Title matches rank first.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const tokens = q.split(/\s+/);
    return index
      .filter((h) => tokens.every((t) => h.haystack.includes(t)))
      .sort((a, b) => {
        const at = a.title.toLowerCase().includes(q) ? 0 : 1;
        const bt = b.title.toLowerCase().includes(q) ? 0 : 1;
        return at - bt;
      })
      .slice(0, 25);
  }, [index, query]);

  // Reset the highlighted row whenever the result set changes.
  useEffect(() => setActive(0), [query]);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (hit: Hit) => {
    navigate(hit.to);
    setQuery("");
    setFocused(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === "Escape") {
      setQuery("");
      setFocused(false);
    }
  };

  const open = focused && query.trim().length > 0;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={onKeyDown}
        placeholder="Search anything — pages, sections, batches, trees, soil, tasks, costs, people…"
        className="pl-9 pr-9 h-11"
        aria-label="Global search"
      />
      {query && (
        <button
          onClick={() => { setQuery(""); setFocused(true); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {open && (
        <div className={`absolute z-50 mt-2 w-full rounded-xl border border-border/60 bg-popover shadow-xl overflow-hidden ${panelClassName}`}>
          {isLoading && results.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading data…
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground text-center">
              No matches for “{query.trim()}”.
            </div>
          ) : (
            <ul className="max-h-96 overflow-auto py-1">
              {results.map((hit, i) => {
                const Icon = hit.icon;
                return (
                  <li key={hit.key}>
                    <button
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(hit)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                        i === active ? "bg-muted" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{hit.title}</p>
                        {hit.subtitle && (
                          <p className="text-[11px] text-muted-foreground truncate">{hit.subtitle}</p>
                        )}
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
                        {hit.group}
                      </span>
                      {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
