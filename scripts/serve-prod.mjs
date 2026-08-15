/**
 * Production static server for the built SPA (dist/).
 * Goals: blazing-fast mobile loads.
 *  - brotli/gzip compression (prefer brotli)
 *  - immutable long cache for content-hashed assets
 *  - no-cache for index.html + SPA fallback
 *  - correct MIME types
 * Usage: node scripts/serve-prod.mjs [port]   (default 8080)
 */
import { createServer } from "node:http";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createBrotliCompress, createGzip } from "node:zlib";
import { extname, join, normalize, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";

const ROOT = resolve(process.cwd(), "dist");
const PORT = Number(process.argv[2] || 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".map": "application/json",
};

function send(res, code, body = "", type = "text/plain; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function hashed(file) {
  // Vite/rolldown hashed asset: name-<hash>.<ext> where hash is 8+ base-62 chars.
  return /[.-][A-Za-z0-9_-]{8,}\.(js|css|woff2?|png|jpe?g|webp|svg|ttf|avif)$/.test(file);
}

function isCompressible(file) {
  return /\.(js|mjs|css|json|html|svg|wasm)$/.test(file);
}

const server = createServer(async (req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch { return send(res, 400, "bad url"); }

  // Normalize to a filesystem-relative path (handles Windows backslash sep).
  const rel = normalize(urlPath.replace(/^\/+/, "") || "index.html").replace(new RegExp("\\" + sep, "g"), "/");
  let file = join(ROOT, rel);

  let size = 0;
  try { size = (await stat(file)).size; }
  catch (e) {
    // SPA fallback: routes without a file extension serve the shell.
    if (!urlPath.includes(".")) { file = join(ROOT, "index.html"); try { size = (await stat(file)).size; } catch { return send(res, 404, "not found"); } }
    else { console.error("MISS", rel, e.code); return send(res, 404, "not found"); }
  }

  const mime = MIME[extname(file).toLowerCase()] || "application/octet-stream";
  const headers = {
    "Content-Type": mime,
    "Vary": "Accept-Encoding",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": hashed(rel) ? "public, max-age=31536000, immutable" : "no-cache",
  };

  const accepts = req.headers["accept-encoding"] || "";
  const compressible = isCompressible(file);

  const tryEnc = (token, mk) => {
    if (!accepts.includes(token)) return false;
    headers["Content-Encoding"] = token;
    res.writeHead(200, headers);
    pipeline(createReadStream(file), mk(), res).catch((err) => { console.error("ENC", token, rel, err.code || err.message); res.destroy(); });
    return true;
  };
  if (compressible && tryEnc("br", createBrotliCompress)) return;
  if (compressible && tryEnc("gzip", createGzip)) return;

  headers["Content-Length"] = size;
  res.writeHead(200, headers);
  pipeline(createReadStream(file), res).catch((err) => { console.error("RAW", rel, err.code || err.message); res.destroy(); });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`✓ prod server: http://localhost:${PORT}/  (dist/, brotli/gzip on)`);
  console.log(`  Network: http://192.168.1.51:${PORT}/  ·  http://100.94.3.33:${PORT}/`);
});
