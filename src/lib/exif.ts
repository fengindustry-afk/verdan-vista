/**
 * When was this photo actually taken?
 *
 * A scan uploaded from the gallery days after it was shot must be dated to the
 * shot, not the upload — under Puro/MRV rules a field observation carries the
 * date it was observed, and "the day someone got round to uploading it" is the
 * kind of gap an auditor discounts the whole record over.
 *
 * Must run on the ORIGINAL File: compressImage/compressReceiptImage re-encode
 * through a canvas, which drops every EXIF tag.
 *
 * Deliberately hand-rolled rather than pulling in exifr (~50 kB) — this reads
 * exactly one tag out of the JPEG APP1 segment.
 */

/** How a capture time was established, recorded so provenance is auditable. */
export type CaptureTimeSource =
  /** EXIF DateTimeOriginal — the camera's own record. Trustworthy. */
  | "exif"
  /** The file's mtime. Usually the capture time, but a copy or a re-save
   *  rewrites it, so it is a hint rather than evidence. */
  | "file"
  /** Nothing known: the caller fell back to "now". */
  | "upload";

export interface CaptureTime {
  /** "YYYY-MM-DD HH:MM:SS" (local, as the camera recorded it). */
  at: string;
  source: CaptureTimeSource;
}

const TAG_DATETIME_ORIGINAL = 0x9003; // in the Exif sub-IFD
const TAG_DATETIME = 0x0132; // in IFD0 — file change time, weaker
const TAG_EXIF_IFD_POINTER = 0x8769;

/** EXIF stores dates as "YYYY:MM:DD HH:MM:SS". Normalise to "YYYY-MM-DD …". */
function normalise(raw: string): string | null {
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  // A camera with a dead clock writes zeroes; that is not a date.
  if (y === "0000" || mo === "00" || d === "00") return null;
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

/**
 * Pull DateTimeOriginal out of a JPEG's EXIF block. Returns null for anything
 * that isn't a JPEG carrying EXIF (PNG, WebP, a stripped image, most HEIC).
 */
export function readExifDateTime(buf: ArrayBuffer): string | null {
  const view = new DataView(buf);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null; // not JPEG

  // Walk the JPEG marker segments looking for APP1 (0xFFE1) holding "Exif\0\0".
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break; // desynced — give up
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if (size < 2) break;
    if (marker === 0xffe1) {
      const tiff = offset + 10; // 4 marker/length bytes + "Exif\0\0"
      if (tiff + 8 > view.byteLength) return null;
      return readTiff(view, tiff);
    }
    // 0xFFDA = start of scan: image data follows, no more metadata.
    if (marker === 0xffda) break;
    offset += 2 + size;
  }
  return null;
}

/** Read the TIFF block inside an APP1 segment; `base` is its first byte. */
function readTiff(view: DataView, base: number): string | null {
  const byteOrder = view.getUint16(base);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return null;
  const le = byteOrder === 0x4949; // "II" = little-endian, "MM" = big
  if (view.getUint16(base + 2, le) !== 42) return null; // TIFF magic

  const ifd0 = base + view.getUint32(base + 4, le);
  // DateTimeOriginal lives in the Exif sub-IFD; DateTime in IFD0 is the
  // weaker "last modified" and only used when the original is absent.
  const exifIfd = readTagValue(view, base, ifd0, TAG_EXIF_IFD_POINTER, le);
  if (typeof exifIfd === "number") {
    const original = readTagValue(view, base, base + exifIfd, TAG_DATETIME_ORIGINAL, le);
    if (typeof original === "string") return normalise(original);
  }
  const fallback = readTagValue(view, base, ifd0, TAG_DATETIME, le);
  return typeof fallback === "string" ? normalise(fallback) : null;
}

/**
 * Find one tag in an IFD. Returns a string for ASCII tags, a number for the
 * LONG pointers, or null when the tag isn't present.
 */
function readTagValue(
  view: DataView,
  base: number,
  ifd: number,
  wantTag: number,
  le: boolean
): string | number | null {
  if (ifd + 2 > view.byteLength) return null;
  const count = view.getUint16(ifd, le);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > view.byteLength) return null;
    if (view.getUint16(entry, le) !== wantTag) continue;

    const type = view.getUint16(entry + 2, le);
    const length = view.getUint32(entry + 4, le);
    if (type === 4) return view.getUint32(entry + 8, le); // LONG (a pointer)
    if (type !== 2) return null; // only ASCII beyond this point

    // Values over 4 bytes are stored elsewhere and the entry holds an offset.
    const start = length > 4 ? base + view.getUint32(entry + 8, le) : entry + 8;
    if (start + length > view.byteLength) return null;
    let out = "";
    for (let j = 0; j < length; j++) {
      const c = view.getUint8(start + j);
      if (c === 0) break; // NUL-terminated
      out += String.fromCharCode(c);
    }
    return out;
  }
  return null;
}

/** Format a Date the way the app stores timestamps ("YYYY-MM-DD HH:MM:SS"). */
function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Best available capture time for a picked file, with its provenance.
 *
 * Falls back through EXIF → file mtime → now. The mtime step is skipped when it
 * is within a minute of now, which is what a fresh camera capture looks like —
 * calling that "file" would imply evidence we don't have.
 */
export async function readCaptureTime(file: File): Promise<CaptureTime> {
  try {
    // EXIF sits at the head of the file; 256 kB is far more than enough and
    // avoids reading a 12 MP photo into memory just to date it.
    const head = await file.slice(0, 256 * 1024).arrayBuffer();
    const exif = readExifDateTime(head);
    if (exif) return { at: exif, source: "exif" };
  } catch {
    // Unreadable slice — fall through to the weaker sources.
  }

  const mtime = file.lastModified;
  if (mtime && Date.now() - mtime > 60_000) {
    return { at: stamp(new Date(mtime)), source: "file" };
  }
  return { at: stamp(new Date()), source: "upload" };
}
