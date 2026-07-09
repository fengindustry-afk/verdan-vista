import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCollection, upsertDocument, deleteDocument } from "@/lib/data";
import { Collections } from "@/lib/collections";
import type {
  Feedstock,
  LocationData,
  GeotaggedPhoto,
  UserProfile,
  Tree,
  TreeReading,
  TreeScan,
  BiomassData,
  CostEntry,
  CostBudget,
  CostCategory,
} from "@/lib/types";
import type { WorkProcessEntry } from "@/lib/workProcess";
import { WORK_PROCESS_SEED } from "@/lib/workProcessSeed";
import { DefaultCostCategories } from "@/lib/validation";

/** Generic collection read. */
function useCollection<T extends { id: string }>(
  collection: (typeof Collections)[keyof typeof Collections]
) {
  return useQuery({
    queryKey: [collection],
    queryFn: () => getCollection<T>(collection),
    staleTime: 60_000,
  });
}

export const useFeedstock = () => useCollection<Feedstock>(Collections.feedstock);
export const useLocations = () => useCollection<LocationData>(Collections.locations);
export const usePhotos = () => useCollection<GeotaggedPhoto>(Collections.photos);
export const useUsers = () => useCollection<UserProfile>(Collections.users);
export const useTrees = () => useCollection<Tree>(Collections.trees);
export const useReadings = () => useCollection<TreeReading>(Collections.readings);
export const useScans = () => useCollection<TreeScan>(Collections.scans);
export const useBiomass = () => useCollection<BiomassData>(Collections.esaBiomass);
export const useGroundTruth = () => useCollection<BiomassData>(Collections.groundTruth);
export const useCostEntries = () => useCollection<CostEntry>(Collections.costEntries);
export const useCostBudgets = () => useCollection<CostBudget>(Collections.costBudgets);
export const useCostCategories = () => useCollection<CostCategory>(Collections.costCategories);

/**
 * Work-process entries from the shared Supabase collection, falling back to the
 * bundled demo seed when the table is empty (demo / preview / offline) so the
 * workflow hub always has data to browse.
 */
export function useWorkProcessEntries() {
  return useQuery({
    queryKey: [Collections.workProcess],
    queryFn: async () => {
      const rows = await getCollection<WorkProcessEntry>(Collections.workProcess);
      return rows.length > 0 ? rows : WORK_PROCESS_SEED;
    },
    staleTime: 60_000,
  });
}

/** Category names for the tracker: custom ones if any have been added, else the built-in defaults. */
export function useCategoryNames(): string[] {
  const { data: categories = [] } = useCostCategories();
  return categories.length > 0 ? categories.map((c) => c.Name) : [...DefaultCostCategories];
}

/** Generic upsert + delete mutations for a collection, invalidating its query. */
export function useUpsert<T extends { id: string }>(
  collection: (typeof Collections)[keyof typeof Collections]
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (doc: T) => upsertDocument<T>(collection, doc),
    onSuccess: () => qc.invalidateQueries({ queryKey: [collection] }),
  });
}

export function useDelete(
  collection: (typeof Collections)[keyof typeof Collections]
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDocument(collection, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [collection] }),
  });
}
