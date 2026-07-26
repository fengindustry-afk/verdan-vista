import { BentoCard } from "@/components/BentoCard";
import { useLocations, usePhotos } from "@/hooks/useCollection";
import { MapPin, Camera, Satellite, Loader2, ExternalLink, Upload, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AddLocationDialog } from "@/components/capture/AddLocationDialog";
import { CapturePhotoDialog } from "@/components/capture/CapturePhotoDialog";
import { StoredImage } from "@/components/StoredImage";
import { InfoTip } from "@/components/InfoTip";
import { Buckets } from "@/lib/storage";
import { useAuth } from "@/lib/auth";
import { hasPermission, Permission } from "@/lib/rbac";
import type { LocationData, GeotaggedPhoto } from "@/lib/types";
import { useRef, useState } from "react";
import { useUpsert, useDelete } from "@/hooks/useCollection";
import { confirmDelete } from "@/components/ConfirmDialog";
import { Collections } from "@/lib/collections";
import { reuploadStoredImage } from "@/lib/capture";
import { toast } from "sonner";

export default function Assets() {
  const { data: locations = [], isLoading: locLoading } = useLocations();
  const { data: photos = [], isLoading: photoLoading } = usePhotos();
  const { role } = useAuth();
  const canAdd = hasPermission(role, Permission.AddLocations);
  // Manager + Admin, matching the asset_locations delete policy in security/rls.sql.
  const canDelete = hasPermission(role, Permission.DeleteLocations);

  const delLoc = useDelete(Collections.locations);
  /**
   * Work-process entries copy a site's name and coordinates in at capture time
   * rather than referencing it, so removing a location never rewrites history —
   * past entries keep the site they were recorded against.
   */
  const removeLoc = async (l: LocationData) => {
    const ok = await confirmDelete({
      title: `Delete "${l.Name || l.id}"?`,
      description:
        "It disappears from the site pickers. Work-process entries already recorded against it keep their coordinates, and the asset can be restored from the Audit Trail.",
    });
    if (!ok) return;
    await delLoc.mutateAsync(l.id);
    toast.success(`Deleted "${l.Name || l.id}"`);
    setLoc(null);
  };

  const delPhoto = useDelete(Collections.photos);
  /**
   * Removes the photo record but deliberately leaves the uploaded object in the
   * bucket: restoring from the Audit Trail brings back a row still pointing at
   * PhotoUrl, and a deleted blob would restore as a broken image. The stored
   * Sha256 also stops a restored record quietly referring to different bytes.
   */
  const removePhoto = async (p: GeotaggedPhoto) => {
    const label = p.Description || p.FileName || "this photo";
    const ok = await confirmDelete({
      title: `Delete ${label}?`,
      description:
        "Geotagged photos are carbon-credit evidence. The image file itself is kept, and the record can be restored from the Audit Trail.",
    });
    if (!ok) return;
    await delPhoto.mutateAsync(p.id);
    toast.success("Photo deleted");
    setPhoto(null);
    setPhotoPreview(null);
  };

  const [loc, setLoc] = useState<LocationData | null>(null);
  const [photo, setPhoto] = useState<GeotaggedPhoto | null>(null);

  // Replace a photo whose upload failed or whose stored object is broken.
  const upsertPhoto = useUpsert<GeotaggedPhoto>(Collections.photos, { surfaceErrors: true });
  const photoFileRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState(false);
  // Freshly uploaded bytes, shown instead of the (possibly stale-cached) stored ref.
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const replacePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !photo) return;
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image file.");
    setReplacing(true);
    try {
      const up = await reuploadStoredImage(Buckets.photos, `${photo.id}.jpg`, file);
      const saved = await upsertPhoto
        .mutateAsync({ ...photo, PhotoUrl: up.path, Sha256: up.sha256 })
        .catch(() => null);
      if (!saved) return; // useUpsert already toasted why
      setPhotoPreview(URL.createObjectURL(up.blob));
      toast.success("Photo replaced");
    } catch (err) {
      toast.error(`Upload failed — ${err instanceof Error ? err.message : "try again"}`);
    } finally {
      setReplacing(false);
    }
  };

  const mapsHref = (lat?: string, lng?: string) =>
    lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : undefined;

  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-72 h-72 -top-36 -right-20 animate-pulse-glow" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Asset Management</h1>
          <p className="text-sm text-muted-foreground mt-1">GPS-tracked sites, geotagged evidence &amp; ESA biomass fusion</p>
        </div>
        {canAdd && (
          <div className="flex gap-2">
            <AddLocationDialog />
            <CapturePhotoDialog />
          </div>
        )}
      </div>

      <Tabs defaultValue="locations">
        <TabsList>
          <TabsTrigger value="locations" className="gap-1.5">
            Locations ({locations.length})
            <InfoTip text="GPS-captured sites: plots, kilns, stores and application areas. Each card shows the coordinates, capture accuracy and any satellite biomass estimate fused in." />
          </TabsTrigger>
          <TabsTrigger value="photos" className="gap-1.5">
            Geotagged Photos ({photos.length})
            <InfoTip text="Field photos stamped with coordinates and time. They are the visual evidence trail behind each carbon-credit claim." />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="locations" className="mt-4">
          {locLoading ? (
            <Loading />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {locations.map((l, i) => (
                <button key={l.id} onClick={() => setLoc(l)} className="text-left">
                  <BentoCard delay={i * 0.05} className="h-full cursor-pointer group">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 group-hover:text-primary transition-colors">
                        <MapPin className="h-3.5 w-3.5 text-primary" /> {l.Name || l.id}
                      </h3>
                      {l.SiteType && <Badge variant="outline" className="text-[10px]">{l.SiteType}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{l.Latitude}, {l.Longitude}</p>
                    <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                      {l.Accuracy && <p>Accuracy: {l.Accuracy}</p>}
                      {l.Timestamp && <p>Recorded: {l.Timestamp}</p>}
                    </div>
                    {l.BiomassDataSource && l.BiomassDataSource !== "NONE" && (
                      <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-1.5 text-[11px] text-cyan-400">
                        <Satellite className="h-3 w-3" /> Biomass: {l.FusedBiomass || l.SatelliteBiomass} ({l.BiomassQuality})
                        <InfoTip text="Above-ground biomass at this site from ESA satellite data, fused with any ground measurements. The bracketed value is the confidence grade." />
                      </div>
                    )}
                  </BentoCard>
                </button>
              ))}
              {locations.length === 0 && <Empty label="No locations yet. Use Add Location to capture one." />}
            </div>
          )}
        </TabsContent>

        <TabsContent value="photos" className="mt-4">
          {photoLoading ? (
            <Loading />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {photos.map((p, i) => (
                <button key={p.id} onClick={() => setPhoto(p)} className="text-left">
                  <BentoCard delay={i * 0.05} className="h-full cursor-pointer group p-0 overflow-hidden">
                    <StoredImage bucket={Buckets.photos} stored={p.PhotoUrl} alt={p.Description} className="w-full h-32 object-cover" />
                    <div className="p-4">
                      <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {p.Description || p.FileName || "Photo"}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{p.Latitude}, {p.Longitude}</p>
                      {p.CarbonCreditPurpose && <Badge variant="outline" className="text-[10px] mt-2">{p.CarbonCreditPurpose}</Badge>}
                    </div>
                  </BentoCard>
                </button>
              ))}
              {photos.length === 0 && <Empty label="No geotagged photos yet. Use Capture Photo to add one." />}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Location detail */}
      <Dialog open={!!loc} onOpenChange={(o) => !o && setLoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> {loc?.Name || loc?.id}</DialogTitle>
          </DialogHeader>
          {loc && (
            <div className="space-y-2 text-sm">
              <Row k="Coordinates" v={`${loc.Latitude}, ${loc.Longitude}`} mono />
              {loc.SiteType && <Row k="Site type" v={loc.SiteType} />}
              {loc.Accuracy && <Row k="Accuracy" v={loc.Accuracy} />}
              {loc.Altitude && <Row k="Altitude" v={loc.Altitude} />}
              {loc.Timestamp && <Row k="Recorded" v={loc.Timestamp} />}
              {loc.CapturedBy && <Row k="Captured by" v={loc.CapturedBy} />}
              {loc.Notes && <Row k="Notes" v={loc.Notes} />}
              {loc.BiomassDataSource && loc.BiomassDataSource !== "NONE" && (
                <Row k="Biomass" v={`${loc.FusedBiomass || loc.SatelliteBiomass} (${loc.BiomassQuality})`} />
              )}
              {mapsHref(loc.Latitude, loc.Longitude) && (
                <a href={mapsHref(loc.Latitude, loc.Longitude)} target="_blank" rel="noreferrer"
                   className="inline-flex items-center gap-1.5 text-primary text-xs mt-2 hover:underline">
                  Open in Google Maps <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {canDelete && (
                <div className="pt-3 mt-1 border-t border-border/50">
                  <button
                    onClick={() => removeLoc(loc)}
                    disabled={delLoc.isPending}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-60"
                  >
                    {delLoc.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Delete asset
                  </button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Photo detail */}
      <Dialog open={!!photo} onOpenChange={(o) => { if (!o) { setPhoto(null); setPhotoPreview(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Camera className="h-4 w-4 text-primary" /> {photo?.Description || "Photo"}</DialogTitle>
          </DialogHeader>
          {photo && (
            <div className="space-y-3">
              <input ref={photoFileRef} type="file" accept="image/*" onChange={replacePhoto} className="hidden" />
              <div className="relative">
                {photoPreview ? (
                  <img src={photoPreview} alt={photo.Description} className="w-full rounded-lg max-h-72 object-cover" />
                ) : (
                  <StoredImage bucket={Buckets.photos} stored={photo.PhotoUrl} alt={photo.Description} className="w-full rounded-lg max-h-72 object-cover" zoomable />
                )}
                {canAdd && (
                  <button
                    onClick={() => photoFileRef.current?.click()}
                    disabled={replacing}
                    title="Upload a new image for this record. The coordinates, time and capture history stay as they are."
                    className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-lg bg-background/80 backdrop-blur px-2.5 py-1 text-xs border border-border disabled:opacity-60"
                  >
                    {replacing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Replace
                  </button>
                )}
              </div>
              <div className="space-y-2 text-sm">
                <Row k="Coordinates" v={`${photo.Latitude}, ${photo.Longitude}`} mono />
                {photo.Accuracy && <Row k="Accuracy" v={photo.Accuracy} />}
                {photo.Timestamp && <Row k="Captured" v={photo.Timestamp} />}
                {photo.CapturedBy && <Row k="By" v={photo.CapturedBy} />}
                {photo.CarbonCreditPurpose && <Row k="Purpose" v={photo.CarbonCreditPurpose} />}
                {mapsHref(photo.Latitude, photo.Longitude) && (
                  <a href={mapsHref(photo.Latitude, photo.Longitude)} target="_blank" rel="noreferrer"
                     className="inline-flex items-center gap-1.5 text-primary text-xs hover:underline">
                    Open in Google Maps <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {canDelete && (
                  <div className="pt-3 mt-1 border-t border-border/50">
                    <button
                      onClick={() => removePhoto(photo)}
                      disabled={delPhoto.isPending}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-60"
                    >
                      {delPhoto.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Delete photo
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Row = ({ k, v, mono }: { k: string; v: string; mono?: boolean }) => (
  <div className="flex items-center justify-between gap-4">
    <span className="text-muted-foreground text-xs">{k}</span>
    <span className={`text-foreground text-xs ${mono ? "font-mono" : ""}`}>{v}</span>
  </div>
);

const Loading = () => (
  <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
  </div>
);

const Empty = ({ label }: { label: string }) => (
  <p className="text-sm text-muted-foreground col-span-full py-10 text-center">{label}</p>
);
