import { BentoCard } from "@/components/BentoCard";
import { HlsPlayer } from "@/components/HlsPlayer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Video, MapPin, Radio } from "lucide-react";
import { useState } from "react";
import { sanitizeStreamUrl } from "@/lib/validation";
import { toast } from "sonner";

interface PresetStream {
  name: string;
  location: string;
  url: string;
}

const LANDMARK_STREAMS: PresetStream[] = [
  { name: "Kolobrzeg Port", location: "Kolobrzeg, Poland", url: "https://cdn-13-go.toya.net.pl/kamery/kolo_port.m3u8" },
  { name: "Warsaw Old Town", location: "Warsaw, Poland", url: "https://hoktastream2.webcamera.pl/warszawa_cam_5f3b1a/warszawa_cam_5f3b1a.stream/playlist.m3u8" },
  { name: "Eger Town Square", location: "Eger, Hungary", url: "https://s159.ipcamlive.com/streams/9fm6opn9d8oyhhxsz/stream.m3u8" },
];

export default function Cctv() {
  const [active, setActive] = useState<PresetStream>(LANDMARK_STREAMS[0]);
  const [customUrl, setCustomUrl] = useState("");

  const connectCustom = () => {
    const safe = sanitizeStreamUrl(customUrl);
    if (!safe) {
      toast.error("Enter a valid http(s) stream URL.");
      return;
    }
    setActive({ name: "Custom Stream", location: "Manual RTSP/HLS", url: safe });
  };

  return (
    <div className="relative p-6 lg:p-8 space-y-6">
      <div className="glow-orb w-72 h-72 -top-36 -right-20 animate-pulse-glow" />
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Video className="h-6 w-6 text-primary" /> CCTV Monitoring
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Live HLS site surveillance &amp; global landmark cameras</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* Active player */}
        <div className="lg:col-span-3 space-y-3">
          <BentoCard>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Radio className="h-3.5 w-3.5 text-primary animate-pulse" /> {active.name}
                </h3>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3" /> {active.location}
                </p>
              </div>
              <span className="rounded-full bg-destructive/15 text-destructive text-[10px] font-medium px-2 py-0.5 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" /> LIVE
              </span>
            </div>
            <HlsPlayer key={active.url} url={active.url} />
          </BentoCard>

          <BentoCard>
            <Label className="text-xs">Connect a custom stream (HLS .m3u8)</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={customUrl}
                placeholder="https://…/stream.m3u8"
                onChange={(e) => setCustomUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && connectCustom()}
              />
              <button
                onClick={connectCustom}
                className="shrink-0 rounded-lg bg-primary text-primary-foreground px-4 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Connect
              </button>
            </div>
          </BentoCard>
        </div>

        {/* Stream list */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Global Landmark Cameras</h2>
          {LANDMARK_STREAMS.map((s, i) => (
            <BentoCard key={s.url} delay={i * 0.05} className="cursor-pointer" >
              <button onClick={() => setActive(s)} className="w-full text-left flex items-center gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active.url === s.url ? "bg-primary/20" : "bg-muted"}`}>
                  <Video className={`h-4 w-4 ${active.url === s.url ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${active.url === s.url ? "text-primary" : "text-foreground"}`}>{s.name}</p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> {s.location}</p>
                </div>
              </button>
            </BentoCard>
          ))}
        </div>
      </div>
    </div>
  );
}
