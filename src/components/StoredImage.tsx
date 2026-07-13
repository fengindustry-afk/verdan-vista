import { useEffect, useState } from "react";
import { resolveImageUrl } from "@/lib/storage";
import { ImageOff, Loader2 } from "lucide-react";
import { ImageLightbox } from "@/components/ImageLightbox";

/** Resolves a stored image reference (bucket path, data URL, or legacy URL) and renders it. */
export function StoredImage({
  bucket,
  stored,
  fallback,
  alt = "",
  className = "",
  zoomable = false,
}: {
  bucket: string;
  stored?: string;
  /** Inline data URL used when `stored` can't be resolved to a URL (e.g. a
   *  storage object whose signed URL can't be produced in this environment).
   *  Guarantees a just-uploaded image still renders instead of "No image". */
  fallback?: string;
  alt?: string;
  className?: string;
  /** When true, clicking the image opens a full-screen lightbox to inspect it. */
  zoomable?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "none">("loading");
  const [zoom, setZoom] = useState(false);
  // Track whether the resolved (signed/remote) URL failed to actually load so we
  // can fall back to the inline base64 copy. A signed URL can be produced fine
  // yet still 404 (object missing / not viewable in this environment) — without
  // this the <img> would render broken/blank instead of using the fallback.
  const [triedFallback, setTriedFallback] = useState(false);

  useEffect(() => {
    let active = true;
    setState("loading");
    setTriedFallback(false);
    resolveImageUrl(bucket, stored)
      .then((u) => {
        if (!active) return;
        const resolved = u ?? fallback ?? null;
        setUrl(resolved);
        setState(resolved ? "ok" : "none");
      })
      .catch(() => {
        if (!active) return;
        setUrl(fallback ?? null);
        setState(fallback ? "ok" : "none");
      });
    return () => {
      active = false;
    };
  }, [bucket, stored, fallback]);

  // The resolved URL failed to load (e.g. signed URL 404s): swap in the inline
  // base64 fallback if we have one and haven't already tried it.
  const onImgError = () => {
    if (!triedFallback && fallback && url !== fallback) {
      setTriedFallback(true);
      setUrl(fallback);
    } else {
      setState("none");
    }
  };

  if (state === "loading") {
    return (
      <div className={`flex items-center justify-center bg-muted ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (state === "none" || !url) {
    return (
      <div className={`flex flex-col items-center justify-center gap-1 bg-muted text-muted-foreground ${className}`}>
        <ImageOff className="h-5 w-5" />
        <span className="text-[10px]">No image</span>
      </div>
    );
  }
  if (!zoomable) {
    return <img src={url} alt={alt} className={className} loading="lazy" onError={onImgError} />;
  }
  return (
    <>
      <img
        src={url}
        alt={alt}
        className={`${className} cursor-zoom-in`}
        loading="lazy"
        onError={onImgError}
        onClick={(e) => {
          e.stopPropagation();
          setZoom(true);
        }}
      />
      <ImageLightbox src={url} alt={alt} open={zoom} onClose={() => setZoom(false)} />
    </>
  );
}
