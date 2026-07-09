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
}

export interface CostBudget {
  id: string;
  Category: string;
  MonthlyLimit: number;
}

export interface CostCategory {
  id: string;
  Name: string;
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
  Subtotal?: number | null;
  /** "SST" | "GST" | "None" — the indirect-tax regime shown on the receipt. */
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
  /** "review" (fields need confirming) | "confirmed". */
  Status?: string;
  CapturedBy?: string;
  CapturedAt?: string;
  /** ISO date until which this record must be retained (7-year rule). */
  RetentionUntil?: string;
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
  CustomPermissions?: string;
  CreatedAt?: string;
  LastLoginAt?: string;
}
