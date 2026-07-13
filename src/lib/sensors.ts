/**
 * dMRV sensor-ingestion schema (Backlog task A3).
 *
 * Defines the canonical set of monitored parameters, the wire payload a field
 * device sends, and the stored-reading shape — the "sensor-ingestion layer
 * against mocked data" so real IoT can plug in later with no redesign.
 *
 * The parameter catalog is grounded in the Puro.earth Biochar Methodology,
 * Edition 2025 (v.2, Approved) rather than memory:
 *   - Rule 3.5.38: carbonization temperature and reactor residence time must be
 *     recorded at 1-minute intervals ("continuous" parameters below).
 *   - Rule 6.1.3 / 6.1.4: biochar dry mass = wet mass (scale) + moisture; in-line
 *     moisture sensors require ≥2% accuracy and calibration.
 *   - Rule 9.3.4: every reading must be time-stamped, quantitative, and retained
 *     for ≥2 years past the crediting period.
 * Corg (%) and H/Corg are laboratory-determined (rules 6.1.6 / 6.2.3), so they
 * are NOT device-streamed parameters — they enter via lab-result entry, not here.
 *
 * This module is intentionally framework-neutral (no import.meta / DOM) so the
 * mock generator and the ingest endpoint can reason about the same catalog.
 */

/** Where in the 150 TPD EFB → 38 TPD biochar flow a parameter is measured. */
export type SensorStage =
  | "feedstock" // intake / weighbridge / drying
  | "pyrolysis" // reactor carbonization
  | "output" // biochar quench, screening, bagging
  | "energy" // energy meters (LCA project emissions)
  | "environment"; // flue gas / ambient (safety + LCA)

export interface ParameterSpec {
  /** Canonical machine key sent on the wire (snake_case, stable — never rename). */
  key: string;
  /** Human label for dashboards. */
  label: string;
  /** SI-ish unit the value must be reported in. */
  unit: string;
  stage: SensorStage;
  /**
   * Plausible physical range. Readings outside are accepted but flagged
   * `SUSPECT` so tampering/mis-calibration is visible rather than silently
   * trusted (the priority dMRV attack is data that inflates carbon figures).
   */
  min: number;
  max: number;
  /**
   * True for parameters the methodology requires at 1-minute cadence
   * (rule 3.5.38). Drives gap detection in monitoring.
   */
  continuous: boolean;
  /** Methodology rule this parameter serves, for the audit trail. */
  methodologyRef: string;
}

/**
 * The monitored-parameter catalog. Keep keys stable: they are the contract
 * between field devices, the ingest endpoint, and the dashboards.
 */
export const PARAMETERS: readonly ParameterSpec[] = [
  // ── Feedstock intake ──────────────────────────────────────────────────────
  {
    key: "feedstock_intake_mass_kg",
    label: "Feedstock intake mass",
    unit: "kg",
    stage: "feedstock",
    min: 0,
    max: 50_000,
    continuous: false,
    methodologyRef: "3.4 / 3.5.40",
  },
  {
    key: "feedstock_moisture_pct",
    label: "Feedstock moisture",
    unit: "%",
    stage: "feedstock",
    min: 0,
    max: 90,
    continuous: false,
    methodologyRef: "6.1.3",
  },
  // ── Pyrolysis reactor (1-minute cadence, rule 3.5.38) ─────────────────────
  {
    key: "carbonization_temp_c",
    label: "Carbonization temperature",
    unit: "°C",
    stage: "pyrolysis",
    // Highest temperature biomass/biochar is exposed to; EFB pyrolysis ~350–750°C.
    min: 0,
    max: 1200,
    continuous: true,
    methodologyRef: "3.5.38(a)",
  },
  {
    key: "reactor_residence_time_min",
    label: "Reactor residence time",
    unit: "min",
    stage: "pyrolysis",
    // Excludes residence time in cooling screws (rule 3.5.38b).
    min: 0,
    max: 240,
    continuous: true,
    methodologyRef: "3.5.38(b)",
  },
  // ── Biochar output ────────────────────────────────────────────────────────
  {
    key: "biochar_output_mass_kg",
    label: "Biochar output mass (wet)",
    unit: "kg",
    stage: "output",
    min: 0,
    max: 20_000,
    continuous: false,
    methodologyRef: "6.1.3",
  },
  {
    key: "biochar_moisture_pct",
    label: "Biochar moisture",
    unit: "%",
    stage: "output",
    // In-line moisture sensor: methodology requires ≥2% accuracy (rule 6.1.4c).
    min: 0,
    max: 80,
    continuous: false,
    methodologyRef: "6.1.4(c)",
  },
  // ── Energy (feeds LCA project emissions) ──────────────────────────────────
  {
    key: "energy_consumed_kwh",
    label: "Grid/electricity consumed",
    unit: "kWh",
    stage: "energy",
    min: 0,
    max: 100_000,
    continuous: false,
    methodologyRef: "7 (project emissions)",
  },
  {
    key: "energy_exported_kwh",
    label: "Energy exported (avoided grid)",
    unit: "kWh",
    stage: "energy",
    min: 0,
    max: 100_000,
    continuous: false,
    methodologyRef: "7 (emissions avoided)",
  },
  // ── Environment / process safety ──────────────────────────────────────────
  {
    key: "flue_gas_temp_c",
    label: "Flue gas temperature",
    unit: "°C",
    stage: "environment",
    min: 0,
    max: 1000,
    continuous: true,
    methodologyRef: "9.1.1(b)",
  },
  {
    key: "flue_gas_o2_pct",
    label: "Flue gas O₂",
    unit: "%",
    stage: "environment",
    min: 0,
    max: 25,
    continuous: true,
    methodologyRef: "9.1.1(b)",
  },
] as const;

/** Fast lookup of a parameter spec by its canonical key. */
export const PARAMETER_BY_KEY: Record<string, ParameterSpec> = Object.fromEntries(
  PARAMETERS.map((p) => [p.key, p])
);

export type QualityFlag = "OK" | "SUSPECT" | "CALIBRATION";

/**
 * The wire payload a field device POSTs to `/api/ingest/sensor`. Deliberately
 * flat and small so a constrained gateway (LoRaWAN/cellular, see backlog D2) can
 * emit it. `sig` is an HMAC-SHA256 over the canonical fields keyed by the
 * device's shared secret — see {@link canonicalSignString}.
 */
export interface SensorPayload {
  /** Registered device id (see `sensor_devices`). */
  deviceId: string;
  /** Canonical parameter key — must exist in {@link PARAMETER_BY_KEY}. */
  metric: string;
  /** Numeric measurement, in the parameter's declared unit. */
  value: number;
  /** Unit as sent; must match the catalog unit (guards against unit drift). */
  unit: string;
  /** Device-side reading time, ISO 8601 (the authoritative measurement time). */
  ts: string;
  /**
   * Monotonic per-device sequence number. Gaps reveal dropped/held-back
   * readings; a replayed lower value reveals tampering.
   */
  seq: number;
  /** Optional link to the biochar production batch (rules 3.5.40 / 3.5.41). */
  batchId?: string;
  /** Optional device-declared quality; server may override to SUSPECT. */
  quality?: QualityFlag;
  /** Hex HMAC-SHA256 of {@link canonicalSignString} under the device secret. */
  sig?: string;
}

/**
 * Stored reading (the jsonb payload of a `sensor_readings` row). PascalCase to
 * match the document-store convention shared with the .NET/mobile clients.
 * `id` is assigned by the ingest endpoint (`{deviceId}:{seq}` — idempotent, so a
 * retried POST can't create a duplicate reading).
 */
export interface SensorReading {
  id: string;
  DeviceId: string;
  Metric: string;
  Value: number;
  Unit: string;
  Stage: SensorStage;
  /** Device-side reading time (authoritative). */
  ReadingAt: string;
  /** Server receipt time (tamper-evidence: compare against ReadingAt). */
  ReceivedAt: string;
  Seq: number;
  BatchId?: string;
  Quality: QualityFlag;
  /** Whether the HMAC signature verified against the device secret. */
  SigValid: boolean;
}

/**
 * Canonical string signed by the device and re-computed server-side. Fixed field
 * order and separator so both sides produce byte-identical input. Excludes `sig`
 * itself. Keep in lock-step with the ingest endpoint and the mock generator.
 */
export function canonicalSignString(
  p: Pick<SensorPayload, "deviceId" | "metric" | "value" | "unit" | "ts" | "seq">
): string {
  return [p.deviceId, p.metric, p.value, p.unit, p.ts, p.seq].join("|");
}

export interface ValidationResult {
  ok: boolean;
  /** Reason the payload is structurally invalid (rejected outright). */
  error?: string;
  /**
   * Quality flag derived from range/plausibility checks. A structurally valid
   * reading whose value is out of range is still stored, but flagged SUSPECT so
   * an auditor sees it rather than trusting a figure that may be tampered.
   */
  quality?: QualityFlag;
}

/**
 * Structural + plausibility validation shared by the endpoint and tests.
 * Signature verification is done separately (needs the device secret).
 */
export function validatePayload(p: unknown): ValidationResult {
  if (typeof p !== "object" || p === null) return { ok: false, error: "payload is not an object" };
  const r = p as Record<string, unknown>;

  if (typeof r.deviceId !== "string" || r.deviceId.length === 0)
    return { ok: false, error: "deviceId is required" };
  if (typeof r.metric !== "string") return { ok: false, error: "metric is required" };

  const spec = PARAMETER_BY_KEY[r.metric];
  if (!spec) return { ok: false, error: `unknown metric "${r.metric}"` };

  if (typeof r.value !== "number" || !Number.isFinite(r.value))
    return { ok: false, error: "value must be a finite number" };
  if (r.unit !== spec.unit)
    return { ok: false, error: `unit "${String(r.unit)}" != expected "${spec.unit}"` };
  if (typeof r.ts !== "string" || Number.isNaN(Date.parse(r.ts)))
    return { ok: false, error: "ts must be an ISO-8601 timestamp" };
  if (typeof r.seq !== "number" || !Number.isInteger(r.seq) || r.seq < 0)
    return { ok: false, error: "seq must be a non-negative integer" };
  if (r.quality !== undefined && !["OK", "SUSPECT", "CALIBRATION"].includes(r.quality as string))
    return { ok: false, error: "quality must be OK | SUSPECT | CALIBRATION" };

  const inRange = r.value >= spec.min && r.value <= spec.max;
  const quality: QualityFlag = (r.quality as QualityFlag) ?? (inRange ? "OK" : "SUSPECT");

  return { ok: true, quality: inRange ? quality : "SUSPECT" };
}
