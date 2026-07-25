/**
 * Transport emissions for the feedstock trail captured on Feedstock Collection
 * (see TRAIL in lib/workProcess). Hauling biomass by diesel lorry emits CO₂e,
 * which is a PROJECT EMISSION under Puro: it belongs in the LCA term that
 * `corcMetrics` subtracts from durable removal, so a longer haul issues fewer
 * CORCs. Without this, distance is recorded but never charged for.
 *
 * ⚠️ The factors below are ROUND PLACEHOLDERS, not audited values. Puro requires
 * documented, source-cited emission factors, so before these numbers go anywhere
 * near an issued credit they must be replaced with the project's own figures
 * (DEFRA / GLEC freight factors, or the Malaysian equivalent) for the actual
 * vehicle class. They are deliberately kept in one table to make that a one-line
 * swap. Treat every output as indicative until that happens.
 *
 * ponytail: vehicle-km, not tonne-km — one lorry, one leg, no payload allocation.
 * Move to tonne-km if a single trip ever carries more than one batch.
 */

/** kg CO₂e per vehicle-km by fuel type. PLACEHOLDERS — see the warning above. */
export const FUEL_KGCO2E_PER_KM: Record<string, number> = {
  Diesel: 0.9,
  Petrol: 0.8,
  Electric: 0.2,
  Other: 0.9,
};

/** The factor for a fuel, falling back to the dirtiest so a blank never flatters the total. */
export function factorFor(fuel: string | undefined): number {
  const f = (fuel ?? "").trim();
  return FUEL_KGCO2E_PER_KM[f] ?? FUEL_KGCO2E_PER_KM.Other;
}

/**
 * tCO₂e for one leg. Returns 0 for a missing or unparseable distance rather than
 * guessing — an absent odometer reading must not silently become an emission of 0
 * that looks measured, so callers should check `hasDistance` to tell the two apart.
 */
export function legEmissionsTco2e(distanceKm: string | number | undefined, fuel?: string): number {
  const km = Number(distanceKm);
  if (!Number.isFinite(km) || km <= 0) return 0;
  return (km * factorFor(fuel)) / 1000;
}

/** True when a leg carries a usable distance, so a 0 can be read as "not recorded". */
export function hasDistance(distanceKm: string | number | undefined): boolean {
  const km = Number(distanceKm);
  return Number.isFinite(km) && km > 0;
}
