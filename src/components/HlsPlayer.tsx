import { useEffect, useRef, useState } from "react";
import Hls, { FetchLoader } from "hls.js";
import { Loader2, VideoOff } from "lucide-react";

/**
 * HLS (.m3u8) video player using hls.js, with native fallback for Safari.
 *
 * Requests go out with NO referrer. Public webcams commonly run hotlink
 * protection that rejects a request carrying someone else's page URL — the
 * Warsaw feed answers 200 with no Referer and 403 with one, so the default
 * policy makes the stream unplayable. This is scoped to the video loader
 * alone and changes nothing about the rest of the app's requests. It also
 * needs the fetch loader: hls.js defaults to XHR, and Referer is a forbidden
 * header there, so it cannot be removed.
 */
export function HlsPlayer({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"loading" | "playing" | "error">("loading");

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;
    setStatus("loading");
    let hls: Hls | null = null;

    const onPlaying = () => setStatus("playing");
    video.addEventListener("playing", onPlaying);

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        loader: FetchLoader,
        fetchSetup: (context, initParams) =>
          new Request(context.url, { ...initParams, referrerPolicy: "no-referrer" }),
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {/* autoplay may be blocked; controls remain */});
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) setStatus("error");
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.addEventListener("loadedmetadata", () => video.play().catch(() => {}));
      video.addEventListener("error", () => setStatus("error"));
    } else {
      setStatus("error");
    }

    return () => {
      video.removeEventListener("playing", onPlaying);
      hls?.destroy();
    };
  }, [url]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      <video ref={videoRef} className="h-full w-full object-cover" controls muted playsInline />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-white/80 bg-black/40">
          <Loader2 className="h-4 w-4 animate-spin" /> Connecting to stream…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-white/70 bg-black/60">
          <VideoOff className="h-6 w-6" />
          Stream unavailable
          <span className="text-[10px] text-white/40 px-6 text-center break-all">{url}</span>
        </div>
      )}
    </div>
  );
}
