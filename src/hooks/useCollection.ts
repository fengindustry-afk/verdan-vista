import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getCollection, upsertDocument, deleteDocument, WriteNotAuthorizedError, TableNotFoundError } from "@/lib/data";
import { Collections } from "@/lib/collections";
import { recordEdit, getHistory, type HistoryEntry } from "@/lib/history";
import type {
  Feedstock,
  LocationData,
  GeotaggedPhoto,
  UserProfile,
  Tree,
  TreeReading,
  SoilSample,
  TreeScan,
  BiomassData,
  CostEntry,
  CostBudget,
  CostCategory,
  Receipt,
  PlotObservation,
  PlotApplication,
} from "@/lib/types";
import type { Group } from "@/lib/types";
import type { SensorReading } from "@/lib/sensors";
import { useAuth } from "@/lib/auth";
import { activeGroupId } from "@/lib/groups";
import type { WorkProcessEntry } from "@/lib/workProcess";
import type { ReadinessStatusDoc } from "@/lib/readiness";
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
export const useGroups = () => useCollection<Group>(Collections.groups);
export const useTrees = () => useCollection<Tree>(Collections.trees);
export const useReadings = () => useCollection<TreeReading>(Collections.readings);
export const useSoilSamples = () => useCollection<SoilSample>(Collections.soilSamples);
export const usePlotObservations = () => useCollection<PlotObservation>(Collections.plotObservations);
export const usePlotApplications = () => useCollection<PlotApplication>(Collections.plotApplications);
export const useScans = () => useCollection<TreeScan>(Collections.scans);
export const useBiomass = () => useCollection<BiomassData>(Collections.esaBiomass);
export const useGroundTruth = () => useCollection<BiomassData>(Collections.groundTruth);
export const useCostEntries = () => useCollection<CostEntry>(Collections.costEntries);
export const useCostBudgets = () => useCollection<CostBudget>(Collections.costBudgets);
export const useCostCategories = () => useCollection<CostCategory>(Collections.costCategories);
export const useReceipts = () => useCollection<Receipt>(Collections.receipts);
export const useSensorReadings = () => useCollection<SensorReading>(Collections.sensorReadings);
export const useReadinessStatus = () => useCollection<ReadinessStatusDoc>(Collections.readiness);

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

/** Meta-collections that never get an access-group stamp. */
const GROUP_STAMP_EXEMPT = new Set<string>([
  Collections.users,
  Collections.groups,
  Collections.editHistory,
]);

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
  opts: { history?: boolean; surfaceErrors?: boolean } = {}
) {
  const qc = useQueryClient();
  const track = opts.history !== false;
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (doc: T) => {
      const before = cachedBefore<T>(qc, collection, doc.id);
      // Stamp the creator's active access group onto NEW records so RLS scopes
      // them to that group (see security/create-groups.sql). Existing records
      // keep whatever GroupId they have (never re-stamped on edit), and
      // meta-collections stay unstamped.
      if (
        !before &&
        !GROUP_STAMP_EXEMPT.has(collection) &&
        (doc as Record<string, unknown>).GroupId === undefined
      ) {
        const gid = activeGroupId(user);
        if (gid) doc = { ...doc, GroupId: gid };
      }
      // `surfaceErrors` makes an RLS/auth rejection throw (instead of silently
      // "succeeding") so the caller can show an honest "not saved" message.
      const saved = await upsertDocument<T>(collection, doc, {
        throwOnUnauthorized: opts.surfaceErrors,
      });
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
    onError: (err) => {
      if (err instanceof WriteNotAuthorizedError) {
        toast.error("Not saved — your account can't write to the server.", {
          description:
            "You're in demo mode or lack permission. Sign in with an Operator/Manager/Admin account to save.",
        });
      } else if (err instanceof TableNotFoundError) {
        toast.error("Not saved — this feature isn't set up in the database yet.", {
          description:
            "The backing table is missing. An admin needs to run the table's setup SQL (and reload the PostgREST schema).",
        });
      }
    },
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
