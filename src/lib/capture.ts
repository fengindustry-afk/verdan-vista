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

/** Down-scales a captured image to keep uploads light (max edge ~1280px, JPEG). */
export async function compressImage(file: File, maxEdge = 1280, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality)
  );
}
