/**
 * Supabase table names. Each table is a document store: rows of
 * (id text primary key, data jsonb, updated_at timestamptz) — mirroring the
 * .NET app's Firestore-style collections so the same records are shared.
 */
export const Collections = {
  feedstock: "feedstock_sourcing",
  locations: "asset_locations",
  photos: "geotagged_photos",
  esaBiomass: "esa_biomass_data",
  esaBiomassCache: "esa_biomass_cache",
  groundTruth: "ground_truth_biomass",
  fusedBiomass: "fused_biomass",
  users: "users",
  groups: "groups",
  trees: "trees",
  readings: "readings",
  soilSamples: "soil_samples",
  scans: "scans",
  labels: "labels",
  plotObservations: "plot_observations",
  plotApplications: "plot_applications",
  plotComparisons: "plot_comparisons",
  costEntries: "cost_entries",
  costBudgets: "cost_budgets",
  costCategories: "cost_categories",
  workProcess: "work_process_entries",
  editHistory: "edit_history",
  receipts: "receipts",
  sensorDevices: "sensor_devices",
  sensorReadings: "sensor_readings",
  readiness: "readiness_status",
} as const;

export type CollectionName = (typeof Collections)[keyof typeof Collections];
