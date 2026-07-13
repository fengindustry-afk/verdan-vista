/**
 * Production Readiness catalog - "OPERATION READINESS - ECOSFERA 3.0 BUKIT DAMAR I-CARE".
 * Ported from the Production readiness.xlsx workbook (4 category sheets ->
 * numbered sections -> activities, each with a PIC and optional 5M/9M attributes).
 * Static reference data; per-activity completion status is tracked separately in the
 * Supabase `readiness_status` collection. Source: Production readiness.xlsx (user-supplied).
 */

import { Users, Truck, Warehouse, Zap, type LucideIcon } from "lucide-react";

export type ReadinessStatusValue = "not_started" | "in_progress" | "done";

/**
 * A per-activity status document in the `readiness_status` collection. `id`
 * equals the activity `Key`, so an activity has at most one status row.
 * Custom tasks use keys prefixed with `custom_` to distinguish them from catalog activities.
 */
export interface ReadinessStatusDoc {
  id: string;
  Status: ReadinessStatusValue;
  Label?: string;
  PIC?: string;
  Note?: string;
  UpdatedBy?: string;
  Timestamp: string;
}

export interface ReadinessActivity {
  /** Stable id used as the document id in the readiness_status collection. */
  Key: string;
  Label: string;
  PIC: string;
  /** Optional 5M/9M attributes (machine, material, method, money, means, market). */
  Attrs: Partial<Record<"machine" | "material" | "method" | "money" | "means" | "market", string>>;
}

export interface ReadinessSection {
  No: number | null;
  Title: string;
  Activities: ReadinessActivity[];
}

export interface ReadinessCategory {
  Key: string;
  Title: string;
  Description: string;
  Icon: LucideIcon;
  Sections: ReadinessSection[];
}

const ICONS: Record<string, LucideIcon> = { Users, Truck, Warehouse, Zap };

export const READINESS_CATALOG: ReadinessCategory[] = [
  {
    Key: "manpower", Title: "Manpower", Description: "Manning, facilities, training & life support", Icon: ICONS["Users"],
    Sections: [
      { No: 1, Title: "Manpower Availability (warm body)", Activities: [
        { Key: "manpower-000", Label: "Manning requirement identification", PIC: "Team", Attrs: { method: "Based on MOO", money: "?", means: "Giat Mara,", market: "Giat Mara, PLBN" } },
        { Key: "manpower-001", Label: "Develop man spec and selection criteria", PIC: "Zahrin", Attrs: {  } },
        { Key: "manpower-002", Label: "Interview drive", PIC: "Zahrin", Attrs: {  } },
        { Key: "manpower-003", Label: "Interview deliberation and selection", PIC: "Zahrin", Attrs: {  } },
        { Key: "manpower-004", Label: "Short list recommendation", PIC: "Zahrin", Attrs: {  } },
        { Key: "manpower-005", Label: "Issue offer letter", PIC: "Yusof", Attrs: {  } },
        { Key: "manpower-006", Label: "Medical check up", PIC: "Zahrin", Attrs: {  } },
        { Key: "manpower-007", Label: "Mobilization", PIC: "Zahrin", Attrs: {  } },
      ] },
      { No: 2, Title: "Office facility", Activities: [
        { Key: "manpower-008", Label: "Identify office requirement", PIC: "Zahrin", Attrs: {  } },
        { Key: "manpower-009", Label: "Set up cabin office and required furniture+ PC+ Printer etc (hot desk)", PIC: "Zahrin", Attrs: { machine: "PC, Printer, wifi" } },
        { Key: "manpower-010", Label: "Assign manpower to work stations", PIC: "Zahrin", Attrs: {  } },
      ] },
      { No: 3, Title: "Training program", Activities: [
        { Key: "manpower-011", Label: "Develop training material (Technician, Labor)", PIC: "Zakwan", Attrs: {  } },
        { Key: "manpower-012", Label: "Conduct induction program (away day)", PIC: "Zakwan", Attrs: {  } },
        { Key: "manpower-013", Label: "Conduct Classroom Training program", PIC: "Zakwan", Attrs: {  } },
        { Key: "manpower-014", Label: "Conduct Field Trainiag Program", PIC: "Zakwan", Attrs: {  } },
      ] },
      { No: 4, Title: "Life Support", Activities: [
        { Key: "manpower-015", Label: "Set up Rest Cabin", PIC: "Zahrin", Attrs: {  } },
        { Key: "manpower-016", Label: "Set up Pantry", PIC: "Zahrin", Attrs: { machine: "Kattle, RC, Utens" } },
        { Key: "manpower-017", Label: "Develop food and drink routine (Hot meal/ pack food)", PIC: "Zahrin", Attrs: {  } },
        { Key: "manpower-018", Label: "Set up toilet and showers", PIC: "Zahrin", Attrs: {  } },
        { Key: "manpower-019", Label: "Set up prayer room", PIC: "Zahrin", Attrs: {  } },
      ] },
    ],
  },
  {
    Key: "feedstock", Title: "Feedstock", Description: "Securing, pre-processing & feeding", Icon: ICONS["Truck"],
    Sections: [
      { No: 1, Title: "Secure feedstock", Activities: [
        { Key: "feedstock-000", Label: "Identify supplier", PIC: "Zahrin", Attrs: {  } },
        { Key: "feedstock-001", Label: "Get quotations feedstock supply", PIC: "Zakwan", Attrs: {  } },
        { Key: "feedstock-002", Label: "Issue WO for feedstock supply", PIC: "Zakwan", Attrs: {  } },
        { Key: "feedstock-003", Label: "Issue delivery instruction", PIC: "Zakwan", Attrs: {  } },
        { Key: "feedstock-004", Label: "Receive feedstock", PIC: "Asheq", Attrs: {  } },
        { Key: "feedstock-005", Label: "Store and inventorized raw feedstock", PIC: "Asheq", Attrs: {  } },
      ] },
      { No: 2, Title: "Prepare storage for raw feed stock (covered)", Activities: [
        { Key: "feedstock-006", Label: "Identify requirment (size, finishes)", PIC: "Aiman", Attrs: {  } },
        { Key: "feedstock-007", Label: "Identify location", PIC: "Aiman", Attrs: {  } },
        { Key: "feedstock-008", Label: "Set up covered laydown", PIC: "Aiman", Attrs: {  } },
      ] },
      { No: 3, Title: "Preprocessing of feedstock", Activities: [
        { Key: "feedstock-009", Label: "Shredding", PIC: "Asheq", Attrs: {  } },
        { Key: "feedstock-010", Label: "Drying (natural?) (60 MT ~ 4 day supply )", PIC: "Asheq", Attrs: { material: "Jumbo bags" } },
        { Key: "feedstock-011", Label: "Storing", PIC: "Asheq", Attrs: { means: "Covered dry storage" } },
        { Key: "feedstock-012", Label: "Inventory & specification (eg. Moisture)", PIC: "", Attrs: {  } },
      ] },
      { No: 3, Title: "Prepare storage for pre-processed feedstock", Activities: [
        { Key: "feedstock-013", Label: "Identify requirement (size, design, finishes)", PIC: "Aiman", Attrs: {  } },
        { Key: "feedstock-014", Label: "Set up covered storage", PIC: "Aiman", Attrs: {  } },
        { Key: "feedstock-015", Label: "Move feedstock to storage", PIC: "Asheq", Attrs: { machine: "Tractor" } },
        { Key: "feedstock-016", Label: "Inventory & specification (eg. Moisture)", PIC: "Asheq", Attrs: {  } },
      ] },
      { No: 4, Title: "Feedstock feeding facility (200 kg/ hr)", Activities: [
        { Key: "feedstock-017", Label: "Identify requirement", PIC: "Zahrin", Attrs: {  } },
        { Key: "feedstock-018", Label: "Get quotations", PIC: "Zahrin", Attrs: {  } },
        { Key: "feedstock-019", Label: "Proccure and delivery feeding facility", PIC: "Zahrin", Attrs: {  } },
        { Key: "feedstock-020", Label: "Set up and test feeding facility", PIC: "Zahrin", Attrs: {  } },
      ] },
    ],
  },
  {
    Key: "logistic-storage", Title: "Logistics & Storage", Description: "Biochar, blending & product storage", Icon: ICONS["Warehouse"],
    Sections: [
      { No: 1, Title: "Prepare storage for Raw biochar, Powder biochar", Activities: [
        { Key: "logistic-storage-000", Label: "Identify requirement (size, design, finishes)", PIC: "Zahrin", Attrs: {  } },
        { Key: "logistic-storage-001", Label: "Set up covered storage", PIC: "Zahrin", Attrs: {  } },
        { Key: "logistic-storage-002", Label: "Move products to storage", PIC: "Zahrin", Attrs: {  } },
        { Key: "logistic-storage-003", Label: "Inventory & quality assurance", PIC: "Zahrin", Attrs: {  } },
      ] },
      { No: 2, Title: "Raw Biochar", Activities: [
        { Key: "logistic-storage-004", Label: "Put biochar inside jumbo bag (200 kg) or 20 kg bags", PIC: "Zakwan", Attrs: {  } },
        { Key: "logistic-storage-005", Label: "Move biochar to raw biochar storage", PIC: "Zakwan", Attrs: {  } },
        { Key: "logistic-storage-006", Label: "Inventorize and quality check", PIC: "Zakwan", Attrs: {  } },
      ] },
      { No: 3, Title: "Powder biochar", Activities: [
        { Key: "logistic-storage-007", Label: "Grind raw biochar", PIC: "Zakwan", Attrs: {  } },
        { Key: "logistic-storage-008", Label: "Bag biochar in 20 kg bag", PIC: "Zakwan", Attrs: {  } },
        { Key: "logistic-storage-009", Label: "Inventorize and quality check", PIC: "Zakwan", Attrs: {  } },
      ] },
      { No: 4, Title: "Blending biochar with compost/ fertilizer", Activities: [
        { Key: "logistic-storage-010", Label: "Identify requirements (MT, specification, percel size)", PIC: "Danial", Attrs: {  } },
        { Key: "logistic-storage-011", Label: "Blend biochar (ribbon mixer)", PIC: "Danial", Attrs: { machine: "10 MT ribbon Mx" } },
        { Key: "logistic-storage-012", Label: "Put fertilizer in 25 kg bags", PIC: "Danial", Attrs: { material: "26 kg bags" } },
        { Key: "logistic-storage-013", Label: "Inventory & specification", PIC: "Danial", Attrs: {  } },
      ] },
      { No: 5, Title: "Prepare storage for Fertilizer and Soil conditioner", Activities: [
        { Key: "logistic-storage-014", Label: "Identify requirement (size, design, finishes)", PIC: "Danial", Attrs: {  } },
        { Key: "logistic-storage-015", Label: "Set up covered storage", PIC: "Danial", Attrs: {  } },
        { Key: "logistic-storage-016", Label: "Move products to storage", PIC: "Danial", Attrs: {  } },
        { Key: "logistic-storage-017", Label: "Inventory & quality assurance", PIC: "Danial", Attrs: {  } },
      ] },
    ],
  },
  {
    Key: "utility-wifi", Title: "Utility & WiFi", Description: "Power, water, internet & waste", Icon: ICONS["Zap"],
    Sections: [
      { No: 1, Title: "Expanded electricity supply (existing)", Activities: [
        { Key: "utility-wifi-000", Label: "Reroute existing cabling/ wiring to storage", PIC: "Zahrin", Attrs: {  } },
        { Key: "utility-wifi-001", Label: "Move all DB and unused cable from workshop to storage area", PIC: "Zahrin", Attrs: {  } },
        { Key: "utility-wifi-002", Label: "Terminate new cabling", PIC: "Zahrin", Attrs: {  } },
        { Key: "utility-wifi-003", Label: "Testing and commissioning", PIC: "Zahrin", Attrs: {  } },
      ] },
      { No: 2, Title: "New electrical supply supply line", Activities: [
        { Key: "utility-wifi-004", Label: "Apply new supply (250 A)", PIC: "Zahrin", Attrs: {  } },
        { Key: "utility-wifi-005", Label: "Secure approval from TNB", PIC: "Zahrin", Attrs: {  } },
        { Key: "utility-wifi-006", Label: "Installation of new cabling and DB (Internal-guarde house )", PIC: "Zahrin", Attrs: {  } },
        { Key: "utility-wifi-007", Label: "Installation of new TNB Cabling from Substation", PIC: "Zahrin", Attrs: {  } },
        { Key: "utility-wifi-008", Label: "Installation of new TNB Metering", PIC: "Zahrin", Attrs: {  } },
        { Key: "utility-wifi-009", Label: "Connection to new supply and test", PIC: "Zahrin", Attrs: {  } },
      ] },
      { No: 3, Title: "Water Supply -Air Selangor", Activities: [
        { Key: "utility-wifi-010", Label: "Confirmation of Bomba requirement", PIC: "Aiman", Attrs: {  } },
        { Key: "utility-wifi-011", Label: "Installation of fire Hydrant", PIC: "Aiman", Attrs: {  } },
        { Key: "utility-wifi-012", Label: "Application of new water meter (150 mm)", PIC: "Aiman", Attrs: {  } },
      ] },
      { No: 4, Title: "Internet services", Activities: [
        { Key: "utility-wifi-013", Label: "Identify requirements (MBPS)", PIC: "Zahrin", Attrs: {  } },
        { Key: "utility-wifi-014", Label: "Apply for new wifi", PIC: "Zahrin", Attrs: {  } },
        { Key: "utility-wifi-015", Label: "Installation of new wifi", PIC: "Zahrin", Attrs: {  } },
        { Key: "utility-wifi-016", Label: "Testing period", PIC: "Zahrin", Attrs: {  } },
      ] },
      { No: 5, Title: "Black water collection service", Activities: [
        { Key: "utility-wifi-017", Label: "Identify requirement", PIC: "Zahrin", Attrs: {  } },
        { Key: "utility-wifi-018", Label: "Identify vendor", PIC: "Zahrin", Attrs: {  } },
      ] },
    ],
  },
];

export const READINESS_ATTR_LABELS: Record<string, string> = {
  machine: "Machine/Tool", material: "Material", method: "Method",
  money: "Money", means: "Means", market: "Market",
};

/** All activities across every category and section, flattened. */
export function allReadinessActivities(): ReadinessActivity[] {
  return READINESS_CATALOG.flatMap((c) => c.Sections.flatMap((s) => s.Activities));
}

/** Count of activities in a category (denominator for its progress bar). */
export function categoryActivityCount(cat: ReadinessCategory): number {
  return cat.Sections.reduce((n, s) => n + s.Activities.length, 0);
}

export const READINESS_STATUS_ORDER: ReadinessStatusValue[] = ["not_started", "in_progress", "done"];
export const READINESS_STATUS_LABEL: Record<ReadinessStatusValue, string> = {
  not_started: "Not started", in_progress: "In progress", done: "Done",
};
