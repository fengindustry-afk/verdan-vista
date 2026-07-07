import { useEffect, useState } from "react";
import { resolveImageUrl } from "@/lib/storage";
import { ImageOff, Loader2 } from "lucide-react";

/** Resolves a stored image reference (bucket path, data URL, or legacy URL) and renders it. */
export function StoredImage({
  bucket,
  stored,
  alt = "",
  className = "",
}: {
  bucket: string;
  stored?: string;
  alt?: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "none">("loading");

  useEffect(() => {
    let active = true;
    setState("loading");
    resolveImageUrl(bucket, stored)
      .then((u) => {
        if (!active) return;
        setUrl(u);
        setState(u ? "ok" : "none");
      })
      .catch(() => active && setState("none"));
    return () => {
      active = false;
    };
  }, [bucket, stored]);

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
  return <img src={url} alt={alt} className={className} loading="lazy" />;
}
