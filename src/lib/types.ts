/**
 * Domain types mirroring the .NET `Models/*.cs`. Property names are PascalCase
 * to match the jsonb payloads written by the mobile/desktop app so both clients
 * read and write the same records.
 */

export interface Feedstock {
  id: string;
  Id?: string;
  Title: string;
  Type: string;
  Date: string;
  Amount: string;
  Status: "Verified" | "Pending" | "Rejected" | string;
  Supplier: string;
  IsWaste?: boolean;
  IsPending?: boolean;
  CurrentStage?: string;
  AuditLog?: string;
  CustodyLog?: string;
  BiocharYieldKg?: number;
  CarbonContentPct?: number;
  HCorgRatio?: number;
  PyrolysisTempC?: number;
  LcaEmissionsTco2e?: number;
}

export interface LocationData {
  id: string;
  Id?: string;
  Latitude: string;
  Longitude: string;
  Accuracy?: string;
  Altitude?: string;
  Speed?: string;
  Timestamp?: string;
  Source?: string;
  Name?: string;
  CapturedBy?: string;
  CapturedById?: string;
  CapturedByEmail?: string;
  SiteType?: string;
  Notes?: string;
  GeofenceRadius?: string;
  SatelliteBiomass?: string;
  FusedBiomass?: string;
  CarbonStock?: string;
  EsaOrbitId?: string;
  BiomassDataSource?: string;
  FusionConfidence?: string;
  BiomassQuality?: string;
  PBandBackscatterHV?: string;
}

export interface GeotaggedPhoto {
  id: string;
  PhotoUrl?: string;
  LocalPath?: string;
  Latitude?: string;
  Longitude?: string;
  Accuracy?: string;
  Altitude?: string;
  Timestamp?: string;
  Description?: string;
  CarbonCreditPurpose?: string;
  CapturedBy?: string;
  FileName?: string;
  FileSize?: number;
}

export interface BiomassData {
  id: string;
  LocationId?: string;
  Latitude?: string;
  Longitude?: string;
  AcquisitionDate?: string;
  BackscatterHH?: number;
  BackscatterHV?: number;
  BackscatterVV?: number;
  AboveGroundBiomass?: number;
  BelowGroundBiomass?: number;
  TotalBiomass?: number;
  BiomassUncertainty?: number;
  SpatialResolution?: number;
  OrbitId?: string;
  DataSource?: string;
  FusionConfidence?: number;
  QualityFlag?: "HIGH" | "MEDIUM" | "LOW" | string;
  CarbonStock?: number;
  ForestType?: string;
  Timestamp?: string;
}

export interface Tree {
  id: string;
  TreeCode: string;
  Species?: string;
  PlotLocation?: string;
  TreatmentGroup?: string;
  Treatment?: string;
  PlotName?: string;
  CropAge?: string;
  TreatmentDate?: string;
  Latitude?: string;
  Longitude?: string;
  Notes?: string;
  CreatedAt?: string;
}

export interface TreeReading {
  id: string;
  TreeId: string;
  Date: string;
  HeightCm?: number | null;
  CanopyCm?: number | null;
  StemDiameterMm?: number | null;
  LeafCount?: number | null;
  Spad?: number | null;
  Flowers?: number | null;
  Fruit?: number | null;
  YieldKg?: number | null;
  Note?: string;
}

/**
 * A soil-analysis sample for the testing plot — the web counterpart of the
 * spreadsheet's "Section E · Analisis Tanah". Each record captures one soil
 * parameter's initial (baseline) and final reading for a treatment group, so
 * the summary can show the percentage change the same way it does for growth.
 */
export interface SoilSample {
  id: string;
  /** BIL POKOK — running number of the sampled tree in the section. */
  TreeNo?: number | null;
  /** ID POKOK — the tree the sample was taken from (e.g. "P1"). */
  TreeId?: string;
  /** Treatment group this sample belongs to (e.g. "ESTERRA", "Control"). */
  TreatmentGroup?: string;
  /** One of SOIL_PARAMS (pH, EC, Organic Carbon, …). */
  Parameter: string;
  InitialReading?: number | null;
  FinalReading?: number | null;
  Date?: string;
  Note?: string;
}

/**
 * Section F – Pemerhatian Visual (visual observation log). One dated row of
 * qualitative field notes on the plot's condition, mirroring the spreadsheet's
 * TARIKH / KEADAAN DAUN / KEADAAN BATANG / KEADAAN TANAH / CATATAN columns.
 */
export interface PlotObservation {
  id: string;
  Date?: string;
  /** Optional treatment group the observation applies to (ESTERRA / Control). */
  TreatmentGroup?: string;
  /** KEADAAN DAUN — leaf condition. */
  LeafCondition?: string;
  /** KEADAAN BATANG — stem/trunk condition. */
  StemCondition?: string;
  /** KEADAAN TANAH — soil condition. */
  SoilCondition?: string;
  /** CATATAN — free-text remarks. */
  Notes?: string;
  RecordedBy?: string;
}

/**
 * Section H – Rekod Aplikasi Produk (product application record). One row per
 * biochar/fertiliser application, mirroring TARIKH / PRODUK / KADAR / BILANGAN
 * POKOK / TOTAL KADAR / PRICE LIST / TOTAL COST / KAEDAH / PEGAWAI / SUPERVISOR.
 */
export interface PlotApplication {
  id: string;
  Date?: string;
  /** PRODUK — product name/grade. */
  Product?: string;
  /** KADAR (KG/POKOK) — application rate per tree. */
  RatePerTreeKg?: number | null;
  /** BILANGAN POKOK — number of trees treated. */
  TreeCount?: number | null;
  /** PRICE LIST (RAW MATERIAL) — unit price per kg (MYR). */
  UnitPrice?: number | null;
  /** KAEDAH APLIKASI — application method (e.g. MENABUR). */
  Method?: string;
  /** PEGAWAI BERTUGAS — officer on duty. */
  Officer?: string;
  /** SUPERVISOR. */
  Supervisor?: string;
  Notes?: string;
}

/**
 * Section G – Biochar vs Non-Biochar. One row per parameter, holding *manual*
 * overrides: whatever is left null falls back to the value computed from the
 * Section B–D readings, which stays the primary source.
 */
export interface PlotComparison {
  id: string;
  /** Parameter key, matching SUMMARY_PARAMS (e.g. "HeightCm"). */
  Parameter: string;
  Date?: string;
  CropType?: string;
  NonBiocharPct?: number | null;
  BiocharPct?: number | null;
  Notes?: string;
}

export interface TreeScan {
  id: string;
  TreeId: string;
  ImageUrl?: string;
  ImageBase64?: string;
  Latitude?: string;
  Longitude?: string;
  Timestamp?: string;
  CapturedBy?: string;
  Notes?: string;
  /** Automated tree-health assessment from the scan image. */
  HealthStatus?: string;
  /** Canopy vigor score 0–100 from the image analysis. */
  HealthScore?: number | null;
  /** Human-readable summary of the health assessment. */
  HealthNote?: string;
  /** ISO timestamp of when the health analysis last ran. */
  AnalyzedAt?: string;
}

export interface CostEntry {
  id: string;
  Title: string;
  Category: string;
  Amount: number;
  Date: string;
  Note?: string;
  CreatedBy?: string;
  /** Owner's login email — RLS uses this to keep Personal-ledger rows private. */
  CreatedByEmail?: string;
  /** Links this expense to a digitised receipt (scanned via Log Expense). */
  ReceiptId?: string;
  /** "Esterra" (business) | "Personal" — which ledger the transaction belongs to. */
  Ledger?: string;
  /** "Expense" | "Income" | "Savings" | "Investment" | "Project" (legacy rows = Expense). */
  Type?: string;
  /** Access-group id stamped on create (see useCollection); absent = shared/unassigned. */
  GroupId?: string;
}

/**
 * A monthly spending limit. Originally per-category (the `Category` field);
 * now generalised so a limit can target any grouping dimension via
 * `ScopeType` + `ScopeKey`. Legacy rows carry only `Category` and are read as
 * `{ ScopeType: "category", ScopeKey: Category }`, so nothing needs migrating.
 */
export interface CostBudget {
  id: string;
  /** Legacy per-category key. Kept for back-compat; equals ScopeKey when ScopeType is "category". */
  Category?: string;
  /** Which dimension this limit applies to (absent = "category"). */
  ScopeType?: "category" | "categoryGroup" | "ledger" | "accessGroup";
  /** The specific group within ScopeType, e.g. a category name, group name, ledger, or group id. */
  ScopeKey?: string;
  MonthlyLimit: number;
}

export interface CostCategory {
  id: string;
  Name: string;
  /** Optional ledger this category primarily belongs to ("Esterra" | "Personal"). */
  Ledger?: string;
  /** Optional category-group this belongs to, e.g. "Operations" (Fuel + Tools + …). */
  Group?: string;
}

/**
 * One purchased line as printed on a receipt. Receipts vary wildly, so every
 * part is optional — we keep whatever the scan could read, verbatim.
 */
export interface ReceiptLineItem {
  Description?: string;
  Qty?: number | null;
  UnitPrice?: number | null;
  Amount?: number | null;
}

/**
 * A digitised paper receipt/invoice for Malaysian tax-audit retention (LHDN
 * requires business records be kept 7 years). Structured fields are extracted
 * from the captured image via OCR, then confirmed by a human. The compressed
 * image itself is retained as the primary evidence.
 */
export interface Receipt {
  id: string;
  /** Vendor / merchant name. */
  Merchant?: string;
  /** Merchant tax identification / SST registration number, if printed. */
  MerchantTin?: string;
  /** Receipt / invoice number. */
  ReceiptNo?: string;
  /** Transaction date, ISO `YYYY-MM-DD`. */
  Date?: string;
  Currency?: string;
  Category?: string;
  /** Itemised lines as printed on the receipt (may be empty for simple receipts). */
  LineItems?: ReceiptLineItem[];
  Subtotal?: number | null;
  /**
   * The indirect-tax label printed on the receipt — normally "SST" (current
   * Malaysian regime) or "None". GST was abolished in Malaysia in 2018 and is
   * only expected on historical receipts that literally print it.
   */
  TaxType?: string;
  TaxRate?: number | null;
  TaxAmount?: number | null;
  Total?: number | null;
  PaymentMethod?: string;
  Notes?: string;
  /** Full OCR text, retained verbatim for audit search & re-parsing. */
  RawText?: string;
  /** Object path in the `receipts` Storage bucket (preferred). */
  ImageUrl?: string;
  /** Inline base64 fallback when Storage is unavailable (no `data:` prefix). */
  ImageBase64?: string;
  ImageMime?: string;
  /** Stored image size in bytes, for storage-usage reporting. */
  ImageBytes?: number;
  /** PDF attachment path in the `receipts` Storage bucket. */
  PdfUrl?: string;
  /** Inline base64 fallback for PDF when Storage is unavailable. */
  PdfBase64?: string;
  /** Stored PDF size in bytes. */
  PdfBytes?: number;
  /** "review" (fields need confirming) | "confirmed". */
  Status?: string;
  CapturedBy?: string;
  CapturedAt?: string;
  /** ISO date until which this record must be retained (7-year rule). */
  RetentionUntil?: string;
}

/**
 * Admin-managed access group. Members may access the listed modules; records
 * stamped with this group's id are visible only to members (+ Admins).
 * Enforced by RLS — see security/create-groups.sql.
 */
export interface Group {
  id: string;
  Name: string;
  Description?: string;
  /** Module ids from MODULES in lib/groups.ts (e.g. "cost-tracker", "trees"). */
  Modules: string[];
}

export interface UserProfile {
  id: string;
  FullName: string;
  Email: string;
  PhoneNumber?: string;
  CompanyName?: string;
  JobTitle?: string;
  Department?: string;
  ProfilePhotoUrl?: string;
  EmployeeId?: string;
  /** Stored as the role name string ("Viewer" | "Operator" | "Manager" | "Admin"). */
  Role: string;
  /** Access-group ids this user belongs to (admin-assigned; pinned by DB trigger). */
  Groups?: string[];
  CustomPermissions?: string;
  CreatedAt?: string;
  LastLoginAt?: string;
}
