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
  // Resolving the URL and downloading the bytes are two separate waits. Without
  // this the component stops showing progress the moment it has a URL, so a slow
  // image (a signed URL fetched over a weak link, or the whole gallery loading at
  // once just after sign-in) renders as blank space and reads as missing data.
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    let active = true;
    setState("loading");
    setTriedFallback(false);
    setPainted(false);
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

  // The resolved URL failed to load (e.g. a signed URL that 404s): swap in the
  // inline base64 copy, or show "No image" once that has been tried too.
  const giveUp = () => {
    if (!triedFallback && fallback && url !== fallback) {
      setTriedFallback(true);
      setPainted(false);
      setUrl(fallback);
    } else {
      setState("none");
    }
  };

  // No stall timeout here on purpose. `loading="lazy"` means an offscreen image
  // has legitimately not started loading yet, and a deadline can't tell that
  // apart from a hung request — it would retire images to "No image" before the
  // user ever scrolls to them. A real failure fires `error`; a slow one arrives.

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
  // Until the bytes land the <img> paints nothing, so it wears a pulsing
  // placeholder background. Styling the image itself (rather than overlaying a
  // second element) keeps the caller's sizing classes authoritative and avoids
  // hiding the image, which would stop `loading="lazy"` from ever fetching it.
  const pending = painted ? "" : "bg-muted animate-pulse";

  if (!zoomable) {
    return (
      <img
        src={url}
        alt={alt}
        className={`${className} ${pending}`}
        loading="lazy"
        onLoad={() => setPainted(true)}
        onError={giveUp}
      />
    );
  }
  return (
    <>
      <img
        src={url}
        alt={alt}
        className={`${className} ${pending} cursor-zoom-in`}
        loading="lazy"
        onLoad={() => setPainted(true)}
        onError={giveUp}
        onClick={(e) => {
          e.stopPropagation();
          setZoom(true);
        }}
      />
      <ImageLightbox src={url} alt={alt} open={zoom} onClose={() => setZoom(false)} />
    </>
  );
}
