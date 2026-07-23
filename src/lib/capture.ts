/**
 * Browser device-capture helpers: GPS via the Geolocation API and image files
 * via a camera-capable file input. Requires HTTPS and the Permissions-Policy to
 * allow `geolocation` / `camera` (see vercel.json / public/_headers).
 */

import { uploadImage } from "./storage";
import { hashStoredImage } from "./hash";

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

/**
 * How far from the site a capture may be taken and still count as evidence.
 *
 * A photo tagged 200 km from the plot is not evidence of the plot, and a
 * registry will discount the record rather than argue about it. The check is a
 * radius around the nearest *known* point (a recorded location or a tree with
 * coordinates) because the project has no plot polygon yet.
 *
 * ponytail: single radius, no polygon. Sites are small and the known points
 * bound them well enough. Swap in a point-in-polygon test if a plot ever gets
 * a real boundary.
 *
 * CALIBRATION KNOB. Tighten this to the plot's real size, but not below what
 * the hardware can see: consumer GPS resolves to roughly 3–10 m open-sky and
 * worse under canopy, so a sub-metre radius rejects captures taken while
 * standing on the tree. Sub-metre fencing needs RTK/differential GPS, not a
 * smaller constant. `geofenceCheck` already subtracts the fix's own reported
 * accuracy, so this number is the tolerance ON TOP of instrument error.
 */
/**
 * Re-upload a replacement image for an existing record: compress, push to
 * storage under the record's key, and re-hash — so a failed original upload (or
 * a broken stored object) can be repaired from the record's edit dialog without
 * losing audit integrity. Returns everything the caller needs to patch its doc,
 * plus the compressed blob for an instant local preview.
 */
export async function reuploadStoredImage(bucket: string, key: string, file: File) {
  const blob = await compressImage(file);
  const stored = await uploadImage(bucket, key, blob, { keepDataUrl: true });
  return {
    blob,
    path: stored.path ?? "",
    base64: stored.dataUrl ? stored.dataUrl.split(",")[1] ?? "" : "",
    sha256: await hashStoredImage(blob),
  };
}

export const GEOFENCE_RADIUS_M = 50;

/** Metres of uncertainty in a fix, parsed from its "±4.2m" accuracy string. */
export function accuracyMeters(fix: { Accuracy?: string }): number {
  const m = fix.Accuracy?.match(/([\d.]+)/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export interface GeofenceResult {
  /** Metres to the nearest known point, or null when none are usable. */
  distance: number | null;
  /** Instrument error already allowed for, in metres. */
  accuracy: number;
  /** True only when the capture is outside the radius even after that slack. */
  outside: boolean;
}

/**
 * Is this fix close enough to a known site point to count?
 *
 * The fix is a circle, not a point, so the honest test is against its near
 * edge: a reading 55 m out with ±10 m accuracy could genuinely be 45 m out.
 * Being strict about a number the receiver never claimed to know would just
 * reject good captures.
 */
export function geofenceCheck(
  fix: GeoPoint & { Accuracy?: string },
  points: GeoPoint[],
  radius = GEOFENCE_RADIUS_M
): GeofenceResult {
  const distance = distanceToNearest(fix, points);
  const accuracy = accuracyMeters(fix);
  return {
    distance,
    accuracy,
    outside: distance !== null && distance - accuracy > radius,
  };
}

/** Great-circle distance in metres between two lat/lon points (haversine). */
export function distanceMeters(
  lat1: number, lon1: number, lat2: number, lon2: number
): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface GeoPoint { Latitude?: string; Longitude?: string }

/**
 * Metres from `fix` to the nearest point that has usable coordinates, or null
 * when none do — with no reference points there is nothing to check against,
 * and a fabricated "0 m away" would be worse than admitting we don't know.
 */
export function distanceToNearest(fix: GeoPoint, points: GeoPoint[]): number | null {
  const lat = Number(fix.Latitude);
  const lon = Number(fix.Longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best: number | null = null;
  for (const p of points) {
    const pLat = Number(p.Latitude);
    const pLon = Number(p.Longitude);
    // Reject blanks: Number("") is 0, which would place every empty record off
    // the coast of Africa and make the nearest-point check meaningless.
    if (!p.Latitude || !p.Longitude || !Number.isFinite(pLat) || !Number.isFinite(pLon)) continue;
    const d = distanceMeters(lat, lon, pLat, pLon);
    if (best === null || d < best) best = d;
  }
  return best;
}
