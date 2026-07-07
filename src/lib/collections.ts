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
  trees: "trees",
  readings: "readings",
  scans: "scans",
  labels: "labels",
} as const;

export type CollectionName = (typeof Collections)[keyof typeof Collections];
