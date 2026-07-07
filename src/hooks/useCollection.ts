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
} from "@/lib/types";

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
