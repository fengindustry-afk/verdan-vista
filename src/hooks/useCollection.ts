import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCollection, upsertDocument, deleteDocument } from "@/lib/data";
import { Collections } from "@/lib/collections";
import { recordEdit, getHistory, type HistoryEntry } from "@/lib/history";
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
  Receipt,
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
export const useReceipts = () => useCollection<Receipt>(Collections.receipts);

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

/** Look up a document's current cached payload (its "before" snapshot for the log). */
function cachedBefore<T extends { id: string }>(
  qc: ReturnType<typeof useQueryClient>,
  collection: (typeof Collections)[keyof typeof Collections],
  id: string
): Record<string, unknown> | undefined {
  const rows = qc.getQueryData<T[]>([collection]);
  return rows?.find((d) => d.id === id) as Record<string, unknown> | undefined;
}

/**
 * Generic upsert + delete mutations for a collection, invalidating its query.
 * Every write also appends an immutable entry to the edit-history log (unless
 * disabled), diffing against the currently cached document.
 */
export function useUpsert<T extends { id: string }>(
  collection: (typeof Collections)[keyof typeof Collections],
  opts: { history?: boolean } = {}
) {
  const qc = useQueryClient();
  const track = opts.history !== false;
  return useMutation({
    mutationFn: async (doc: T) => {
      const before = track ? cachedBefore<T>(qc, collection, doc.id) : undefined;
      const saved = await upsertDocument<T>(collection, doc);
      if (track) {
        void recordEdit({
          collection,
          documentId: saved.id,
          before,
          after: saved as unknown as Record<string, unknown>,
        });
      }
      return saved;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [collection] }),
  });
}

export function useDelete(
  collection: (typeof Collections)[keyof typeof Collections],
  opts: { history?: boolean } = {}
) {
  const qc = useQueryClient();
  const track = opts.history !== false;
  return useMutation({
    mutationFn: async (id: string) => {
      const before = track ? cachedBefore(qc, collection, id) : undefined;
      await deleteDocument(collection, id);
      if (track) void recordEdit({ collection, documentId: id, before, after: undefined });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [collection] }),
  });
}

/**
 * The immutable edit-history log. Optionally scoped to a single document or a
 * set of document ids (e.g. all readings/scans of one tree) within a collection.
 */
export function useHistory(filter?: {
  collection?: (typeof Collections)[keyof typeof Collections];
  documentId?: string;
  documentIds?: string[];
}) {
  return useQuery({
    queryKey: [Collections.editHistory],
    queryFn: getHistory,
    staleTime: 30_000,
    select: (rows: HistoryEntry[]) => {
      if (!filter) return rows;
      const ids = filter.documentIds ? new Set(filter.documentIds) : null;
      return rows.filter(
        (r) =>
          (!filter.collection || r.Collection === filter.collection) &&
          (!filter.documentId || r.DocumentId === filter.documentId) &&
          (!ids || ids.has(r.DocumentId))
      );
    },
  });
}
