import { BentoCard } from "@/components/BentoCard";
import { useLocations, usePhotos } from "@/hooks/useCollection";
import { MapPin, Camera, Satellite, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export default function Assets() {
  const { data: locations = [], isLoading: locLoading } = useLocations();
  const { data: photos = [], isLoading: photoLoading } = usePhotos();

  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-72 h-72 -top-36 -right-20 animate-pulse-glow" />
      <div>
        <h1 className="text-2xl font-bold text-foreground">Asset Management</h1>
        <p className="text-sm text-muted-foreground mt-1">GPS-tracked sites, geotagged evidence &amp; ESA biomass fusion</p>
      </div>

      <Tabs defaultValue="locations">
        <TabsList>
          <TabsTrigger value="locations">Locations ({locations.length})</TabsTrigger>
          <TabsTrigger value="photos">Geotagged Photos ({photos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="locations" className="mt-4">
          {locLoading ? (
            <Loading />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {locations.map((loc, i) => (
                <BentoCard key={loc.id} delay={i * 0.05}>
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-primary" /> {loc.Name || loc.id}
                    </h3>
                    {loc.SiteType && <Badge variant="outline" className="text-[10px]">{loc.SiteType}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    {loc.Latitude}, {loc.Longitude}
                  </p>
                  <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                    {loc.Accuracy && <p>Accuracy: {loc.Accuracy}</p>}
                    {loc.Altitude && <p>Altitude: {loc.Altitude}</p>}
                    {loc.Timestamp && <p>Recorded: {loc.Timestamp}</p>}
                  </div>
                  {loc.BiomassDataSource && loc.BiomassDataSource !== "NONE" && (
                    <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-1.5 text-[11px] text-cyan-400">
                      <Satellite className="h-3 w-3" /> Biomass: {loc.FusedBiomass || loc.SatelliteBiomass} ({loc.BiomassQuality})
                    </div>
                  )}
                </BentoCard>
              ))}
              {locations.length === 0 && <Empty label="No locations recorded." />}
            </div>
          )}
        </TabsContent>

        <TabsContent value="photos" className="mt-4">
          {photoLoading ? (
            <Loading />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {photos.map((p, i) => (
                <BentoCard key={p.id} delay={i * 0.05}>
                  <div className="flex items-start gap-2 mb-2">
                    <Camera className="h-4 w-4 text-primary mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.Description || p.FileName || "Photo"}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{p.Latitude}, {p.Longitude}</p>
                    </div>
                  </div>
                  {p.CarbonCreditPurpose && (
                    <Badge variant="outline" className="text-[10px]">{p.CarbonCreditPurpose}</Badge>
                  )}
                  {p.Timestamp && <p className="text-[11px] text-muted-foreground mt-2">{p.Timestamp}</p>}
                </BentoCard>
              ))}
              {photos.length === 0 && <Empty label="No geotagged photos yet." />}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

const Loading = () => (
  <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
  </div>
);

const Empty = ({ label }: { label: string }) => (
  <p className="text-sm text-muted-foreground col-span-full py-10 text-center">{label}</p>
);
