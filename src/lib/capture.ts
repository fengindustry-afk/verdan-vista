/**
 * Browser device-capture helpers: GPS via the Geolocation API and image files
 * via a camera-capable file input. Requires HTTPS and the Permissions-Policy to
 * allow `geolocation` / `camera` (see vercel.json / public/_headers).
 */

export interface GeoFix {
  Latitude: string;
  Longitude: string;
  Accuracy: string;
  Altitude: string;
  Timestamp: string;
}

/** Resolves the current GPS position, or rejects with a readable error. */
export function getCurrentPosition(): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation isn't supported on this device."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = pos.coords;
        resolve({
          Latitude: c.latitude.toFixed(6),
          Longitude: c.longitude.toFixed(6),
          Accuracy: `±${c.accuracy.toFixed(1)}m`,
          Altitude: c.altitude != null ? `${c.altitude.toFixed(0)}m` : "",
          Timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
        });
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Allow location access and try again."
            : err.code === err.TIMEOUT
            ? "Timed out getting your location. Try again."
            : "Couldn't get your location.";
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

/**
 * Decode an image file to something drawable. Prefers `createImageBitmap` (fast,
 * and `imageOrientation: "from-image"` bakes in EXIF rotation so phone photos
 * aren't sideways), but falls back to an `<img>` element + object URL when that
 * throws — some browsers can't `createImageBitmap` certain camera outputs, which
 * previously made `compressImage` return the raw, un-renderable file (the "scan
 * shows blank" bug). Returns null only when neither path can decode the file.
 */
async function decodeImage(
  file: Blob
): Promise<{ draw: CanvasImageSource; width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { draw: bitmap, width: bitmap.width, height: bitmap.height };
  } catch {
    /* fall through to the <img> decode path */
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = url;
    });
    if (!img || !img.naturalWidth) return null;
    return { draw: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Down-scales a captured image to keep uploads light (max edge ~1280px, JPEG)
 * and normalises it to a browser-renderable JPEG. If the file can't be decoded
 * at all we return it unchanged so capture still proceeds rather than failing.
 */
export async function compressImage(file: File, maxEdge = 1280, quality = 0.8): Promise<Blob> {
  const decoded = await decodeImage(file);
  if (!decoded) return file;
  const { draw, width, height } = decoded;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(draw, 0, 0, w, h);
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b && b.size > 0 ? b : file), "image/jpeg", quality)
  );
}
