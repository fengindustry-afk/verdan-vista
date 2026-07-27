/**
 * Workflow "Work Process Data Collection" form catalog — the TypeScript port of
 * the .NET `Models/WorkflowForms.cs` (Tigasfera work-process workbook). Arranged
 * as: Phase → optional Group → Stage (a data-entry form). Submitted entries are
 * saved to the shared Supabase "work_process_entries" collection, identical in
 * shape to what the mobile/desktop app writes so both clients share the records.
 */

import {
  Truck, Settings2, Droplets, Flame, FlaskConical, Warehouse, Sprout, Trees, Factory,
  type LucideIcon,
} from "lucide-react";
import { distanceMeters } from "./capture";

export type FieldType = "text" | "number" | "date" | "picker" | "multiline" | "location" | "zone" | "batch";

/** A submitted workflow-stage form entry (jsonb payload of a work_process_entries row). */
export interface WorkProcessEntry {
  id: string;
  /** Original PascalCase id written by the .NET app; `id` mirrors it after hydrate. */
  Id?: string;
  StageKey: string;
  StageTitle: string;
  Values: Record<string, string>;
  /** Display name at capture time. Mutable — never use it to identify the author. */
  CapturedBy: string;
  /** Stable author identity. Absent on entries written before attribution landed. */
  CapturedByEmail?: string;
  Timestamp: string;
}

export interface FormField {
  Label: string;
  Key: string;
  Type: FieldType;
  Unit?: string;
  Placeholder?: string;
  Options?: string[];
}

export interface FormSection {
  Title: string;
  Fields: FormField[];
}

export interface WorkflowStageDef {
  Key: string;
  Title: string;
  Phase: string;
  /** Optional grouping within a phase (empty = ungrouped). */
  Group: string;
  Icon: LucideIcon;
  Description: string;
  Sections: FormSection[];
}

export interface StageGroup {
  Title: string;
  Icon?: LucideIcon;
  Stages: WorkflowStageDef[];
}

export interface PhaseGroup {
  Name: string;
  Groups: StageGroup[];
}

/**
 * Slug matching the .NET `WorkflowCatalog.Slug`: lowercase, non-alphanumeric →
 * `_`, collapse repeats, trim underscores. Must stay identical so field keys line
 * up with the shared jsonb payloads.
 */
export function slug(label: string): string {
  let s = label
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_");
  while (s.includes("__")) s = s.replace(/__/g, "_");
  return s.replace(/^_+|_+$/g, "");
}

// Field builders mirroring the C# T/N/D/P/M helpers.
const T = (label: string, ph = ""): FormField => ({ Label: label, Key: slug(label), Type: "text", Placeholder: ph });
const N = (label: string, unit = ""): FormField => ({ Label: label, Key: slug(label), Type: "number", Unit: unit });
const D = (label: string): FormField => ({ Label: label, Key: slug(label), Type: "date" });
const P = (label: string, ...options: string[]): FormField => ({ Label: label, Key: slug(label), Type: "picker", Options: options });
const M = (label: string): FormField => ({ Label: label, Key: slug(label), Type: "multiline" });
const S = (Title: string, ...Fields: FormField[]): FormSection => ({ Title, Fields });

/**
 * Where the stage physically happened, picked from the saved Asset locations.
 * Writes the location name to its own key and the coordinates to `<key>_coords`,
 * so both stay plain readable strings in exports and the preview pane.
 */
const L = (label = "Site"): FormField => ({ Label: label, Key: slug(label), Type: "location" });

/**
 * A coarse zone tag, picked from the admin-managed zones list (Manage zones in
 * the Work Process hub). Options are dynamic — DEFAULT_ZONES is only the seed.
 */
const Z = (label = "Zone"): FormField => ({ Label: label, Key: slug(label), Type: "zone" });

/** Seed zone options before any admin edits — matches the old hardcoded set. */
export const DEFAULT_ZONES = ["Zone A", "Zone B", "Zone C", "Zone D"];

/** Suffix holding the "lat,lng" written alongside a location field. */
export const COORDS_SUFFIX = "_coords";

/**
 * The transport leg captured on Feedstock Collection: where the load came from,
 * which road it took, how far it ran, and where it was dropped. Origin and drop
 * are `location` fields, so each already carries a `<key>_coords` pair.
 */
export const TRAIL = {
  fromKey: slug("Origin Location"),
  routeKey: slug("Route Taken"),
  distanceKey: slug("Distance"),
  fuelKey: slug("Transport Fuel"),
  toKey: slug("Receiving Site"),
} as const;

/** The "lat,lng" of a location field, or null when it isn't a usable pair. */
function coordsOf(values: Record<string, string>, key: string): [number, number] | null {
  const [lat, lng] = (values[key + COORDS_SUFFIX] ?? "").split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
}

/**
 * Straight-line km between the trail's origin and drop coordinates, or null when
 * either is missing. This is a FLOOR, not the distance driven — real roads bend,
 * so transport emissions must come from the odometer figure the driver types into
 * `Distance`. Offered only as a sanity check against that entry.
 */
export function trailStraightLineKm(values: Record<string, string>): number | null {
  const from = coordsOf(values, TRAIL.fromKey);
  const to = coordsOf(values, TRAIL.toKey);
  if (!from || !to) return null;
  return distanceMeters(from[0], from[1], to[0], to[1]) / 1000;
}

/**
 * The batch this stage consumed. `batch_id` identifies the output; this names
 * the input, which is what makes the chain traceable backwards from a sink to
 * the feedstock that produced it. Blank on Feedstock Collection — that stage is
 * where material enters the system.
 */
const SOURCE: FormField = { Label: "Source Batch ID", Key: slug("Source Batch ID"), Type: "batch", Placeholder: "Link to a production batch" };

const BIOMASS = ["Woodchip", "EFB", "PKS", "OPT", "Ash", "Other"];
const FUELS = ["Diesel", "Petrol", "Electric", "Other"];

/** The 9 workflow stages across the Operations and Inventory Management phases. */
export const WORKFLOW_CATALOG: WorkflowStageDef[] = [
  // ── Operations ────────────────────────────────────────────────────────────
  {
    Key: "receiving", Title: "Feedstock Collection", Phase: "Operations", Group: "",
    Icon: Truck, Description: "Daily biomass receiving & laydown storage",
    Sections: [S("Receiving",
      T("Batch ID", "ZA-01-11-24"), D("Pre-Processing Date"),
      P("Biomass Type", ...BIOMASS), L("Origin Location"),
      T("Transport Size", "5 MT Lorry"), P("Transport Fuel", ...FUELS),
      T("Route Taken", "Federal Route 1 → LEKAS → Jln Broga"), N("Distance", "km"),
      Z("Storage Location"), L("Receiving Site"), N("Weight", "kg"), N("Moisture", "%"),
      P("Storage Type", "Covered", "Open"),
      T("Supporting Document", "DO / Invoice / Receipt"), M("Remarks"))],
  },
  {
    Key: "isolation", Title: "Isolation / Sieving", Phase: "Operations", Group: "Feedstock Processing",
    Icon: Settings2, Description: "Sieving & shredding into good feedstock",
    Sections: [S("Sieving / Shredding",
      T("Batch ID"), SOURCE, Z("Zone"), L("Processing Site"), D("Pre-Processing Date"),
      P("Biomass Type", ...BIOMASS), N("Input Quantity", "ton"),
      P("Equipment", "Throwmell", "Shredder"),
      N("Good Feedstock Quantity", "kg"), N("Reject Quantity", "kg"),
      T("Storage Tag"), M("Remarks"))],
  },
  {
    Key: "drying", Title: "Drying", Phase: "Operations", Group: "Feedstock Processing",
    Icon: Droplets, Description: "Daily drying activity",
    Sections: [S("Drying",
      T("Batch ID"), SOURCE, L("Drying Site"), D("Pre-Processing Date"), P("Biomass Type", ...BIOMASS),
      N("Input Quantity", "kg"), P("Drying Equipment", "Sun", "Oven", "Rotary", "Other"),
      N("Drying Duration", "h/day"), N("Moisture Before", "%"), N("Moisture After", "%"),
      N("Output Quantity", "kg"), T("Storage Location"), T("Evidence"), M("Remarks"))],
  },
  {
    Key: "production_05", Title: "Biochar Production 0.5", Phase: "Operations", Group: "Material Conversion",
    Icon: Flame, Description: "Ecosfera 0.5 pyrolysis operation",
    Sections: [S("Ecosfera 0.5",
      T("Batch ID", "ZA-01-11-24 (0.5)"), SOURCE, L("Reactor Site"), D("Production Date"), P("Type of Biomass", ...BIOMASS),
      N("Biomass Input Amount", "kg"), N("Moisture Content of Biomass", "%"),
      N("Weight of Fuel", "kg"), N("Pyrolysis Temp (Max)", "°C"), N("Residence Time", "h"),
      N("Tar / Vinegar Amount", "kg"), T("Emission", "O2/H2S/Ex/CO/PM10"),
      N("Biochar Moisture after Drying", "%"), N("Final Biochar Amount", "kg"),
      T("Storage Location"), N("H/C Ratio (sampling)"))],
  },
  {
    Key: "production_10", Title: "Biochar Production 1.0", Phase: "Operations", Group: "Material Conversion",
    Icon: Flame, Description: "Ecosfera 1.0 pyrolysis operation",
    Sections: [S("Ecosfera 1.0",
      T("Batch ID", "08012025 CYB (1.0)"), SOURCE, L("Reactor Site"), D("Production Date"), P("Type of Biomass", ...BIOMASS),
      N("Biomass Input Amount", "kg"), N("Moisture Content of Biomass", "%"),
      N("Diesel Energy (36 MJ/L)", "MJ"), N("Pyrolysis Temp (Min)", "°C"), N("Pyrolysis Temp (Max)", "°C"),
      N("Residence Time", "h"), N("Tar / Vinegar Amount", "kg"), T("Emission", "O2/H2S/Ex/CO/PM10"),
      N("Biochar Moisture after Drying", "%"), N("Final Biochar Amount", "kg"),
      T("Storage Location"), N("H/C Ratio (sampling)"))],
  },
  {
    Key: "sampling", Title: "Sampling", Phase: "Operations", Group: "",
    Icon: FlaskConical, Description: "Lab QA — H:C ratio & composition sampling",
    Sections: [S("Sampling",
      T("Batch ID"), L("Sampling Site"), D("Sampling Date"),
      P("Sample Type", "Biochar", "Feedstock", "Liquid / Tar"),
      N("H/C Ratio"), N("Moisture Content", "%"), N("Carbon Content", "%"),
      N("Sample Weight", "kg"), N("Density Raw Biochar", "MT/m3"), N("Density Liquid", "kg/L"),
      T("Lab / Method"), M("Remarks"))],
  },

  // ── Inventory Management ────────────────────────────────────────────────────
  {
    Key: "warehouse", Title: "Warehouse", Phase: "Inventory Management", Group: "",
    Icon: Warehouse, Description: "Cured biochar & product in storage",
    Sections: [S("Warehouse",
      T("Batch ID"), SOURCE, D("Date"),
      P("Product", "Biochar", "Biochar Powder", "Liquid / Tar", "Fertiliser", "External Biochar"),
      N("Quantity", "kg"), T("Storage Location"), L("Warehouse Site"), Z("Zone"),
      P("Storage Type", "Covered", "Open"),
      N("Distance", "km"), P("Transport Fuel", ...FUELS), M("Remarks"))],
  },
  {
    Key: "application", Title: "Application", Phase: "Inventory Management", Group: "",
    Icon: Sprout, Description: "Use biochar in product: fertilizer, construction material, or animal feedlot",
    Sections: [
      S("Biochar Usage",
        T("Batch ID"), SOURCE, T("Biochar DO"), D("Application Date"), N("Quantity Applied", "kg"),
        L("Application Site"),
        P("Application Type", "Fertilizer", "Construction", "Animal Feedlot", "Soil", "Additives", "R&D"),
        T("Delivery Mode"), N("Distance", "km"), P("Transport Fuel", ...FUELS),
        T("Location of Mixing / Processing"), T("Location of Storage"),
        T("Supporting Document", "DO / Invoice / Receipt"), M("Remarks")),
      S("Liquid Usage",
        T("Liquid Batch ID"), T("Liquid & Tar DO"), D("Collection Date"),
        N("Weight", "kg"), P("Application Usage", "Store", "Sell", "Fuel"), T("Liquid Storage Location")),
    ],
  },
  {
    Key: "carbon_sink", Title: "Carbon Sink", Phase: "Inventory Management", Group: "",
    Icon: Trees, Description: "Permanently store the carbon",
    Sections: [S("Carbon Sink Tracking",
      T("Batch ID", "TIGGT-BT-2505-0001"), SOURCE, T("Supporting Document", "DO / Invoice / Receipt"),
      D("Procurement / Delivery Date"), D("Usage Date"), N("Quantity", "kg"),
      P("Carbon Sink Type", "Small Holder", "Community", "Municipality", "Estate", "Afforestation"),
      L("Sink Site"), T("Location of Final Permanent Application"), T("Project Type"),
      N("Distance", "km"), P("Transport Fuel", ...FUELS),
      T("Evidence"), M("Remarks"), T("References"))],
  },
  {
    Key: "certification", Title: "Carbon Certification", Phase: "Inventory Management", Group: "",
    Icon: FlaskConical, Description: "Registry verification & certification of issued CORCs",
    Sections: [S("Certification",
      T("Batch ID"), SOURCE, D("Verification Date"), T("Registry / Auditor"),
      N("Verified CORC", "tCO2e"), N("Certified CORC", "tCO2e"),
      T("Certificate Reference"), T("Evidence"), M("Remarks"))],
  },
];

/** Icon for a workflow group button (ungrouped groups have no icon). */
const GROUP_ICONS: Record<string, LucideIcon> = {
  "Feedstock Processing": Settings2,
  "Material Conversion": Factory,
};

export function stageByKey(key: string): WorkflowStageDef | undefined {
  return WORKFLOW_CATALOG.find((s) => s.Key.toLowerCase() === key.toLowerCase());
}

/** Phase → consecutive Groups → Stages, preserving declaration order (mirrors .NET `Phases()`). */
export function phases(): PhaseGroup[] {
  const result: PhaseGroup[] = [];
  const phaseNames = [...new Set(WORKFLOW_CATALOG.map((s) => s.Phase))];
  for (const name of phaseNames) {
    const pg: PhaseGroup = { Name: name, Groups: [] };
    let current: StageGroup | null = null;
    for (const s of WORKFLOW_CATALOG.filter((s) => s.Phase === name)) {
      if (!current || current.Title !== s.Group) {
        current = { Title: s.Group, Icon: GROUP_ICONS[s.Group], Stages: [] };
        pg.Groups.push(current);
      }
      current.Stages.push(s);
    }
    result.push(pg);
  }
  return result;
}

/** Every field across a stage's sections, in order. */
export function stageFields(stage: WorkflowStageDef): FormField[] {
  return stage.Sections.flatMap((s) => s.Fields);
}

/** List-row title for an entry: its Batch ID value, else the stage title. */
export function entryTitle(entry: WorkProcessEntry): string {
  return entry.Values["batch_id"]?.trim() || entry.StageTitle;
}

/** List-row subtitle: up to three other non-empty field values, joined by " · ". */
export function entrySubtitle(entry: WorkProcessEntry): string {
  return Object.entries(entry.Values)
    .filter(([k, v]) => k !== "batch_id" && v?.trim())
    .slice(0, 3)
    .map(([, v]) => v)
    .join(" · ");
}

/** Friendly label from a value key when no field def is available (Prettify fallback). */
export function prettify(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatEntryTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
