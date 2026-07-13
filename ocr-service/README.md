# Esterra OCR Service

A small self-hosted FastAPI service that reads receipt (or any) images into text
with a stronger engine than the in-browser Tesseract fallback. FOSS, CPU-only,
zero cloud cost — designed to run on an **Ubuntu VirtualBox VM** you turn on when
you need it.

```
POST /ocr   (multipart field "file")  ->  { "text": "...", "backend": "paddle", "ms": 412 }
GET  /health                          ->  { "status": "ok", "backend": "paddle" }
```

The `{ "text": ... }` shape is exactly what the web app's receipt parser
(`src/lib/receipts.ts`) already consumes, so switching engines needs no parser
change.

## Backends

| `OCR_BACKEND` | Needs | Notes |
|---|---|---|
| `paddle` (default) | CPU | PaddleOCR — best FOSS accuracy on messy receipts. Recommended for the VM. |
| `tesseract` | CPU + `tesseract-ocr` | Lightest; server-side mirror of the browser engine. |
| `qwen` | **GPU** | Qwen2.5-VL structured extraction — **stub**. Enable on the Windows PC/GPU later, not the VM. |

## Run on the Ubuntu VM

```bash
cd ocr-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt          # first paddle run also downloads models
cp .env.example .env                       # edit CORS origins if needed
./run.sh                                    # serves on 0.0.0.0:8000
```

`GET http://localhost:8000/health` should return `{"status":"ok","backend":"paddle"}`.

### One-command sanity check

`verify.py` pings `/health` and runs an image through `/ocr` (a synthetic
receipt if you don't pass one). Stdlib-only — no extra install.

```bash
python verify.py                          # localhost, synthetic receipt
python verify.py --url http://192.168.1.42:8000   # the VM from your host
python verify.py --image ./some_receipt.jpg       # your own image
```

Exit codes: `0` text recognised · `1` unreachable/error · `2` up but read nothing.

### Make the VM reachable from your dev machine / phone

1. VirtualBox → VM → Settings → Network → **Adapter 1 → Attached to: Bridged Adapter**.
2. In the VM: `ip addr` → note the LAN IP (e.g. `192.168.1.42`).
3. The service already binds `0.0.0.0`, so from your host: `curl http://192.168.1.42:8000/health`.
4. Point the web app at it — set `VITE_OCR_URL` (see below).

> If it's unreachable, check the **VM's own firewall** (`sudo ufw allow 8000`) and
> that host + VM are on the same network.

## Wire the web app

Set in the app's `.env` (Vite):

```
VITE_OCR_URL=http://192.168.1.42:8000
```

The app calls this service first and **falls back to browser Tesseract**
automatically when the VM is off or unreachable — so nothing breaks when the VM
is down (see `src/lib/ocr.ts`).

### ⚠️ Mixed-content caveat

A browser page served over **HTTPS** (e.g. the deployed app) cannot call an
**HTTP** LAN address — the browser blocks it. This LAN setup works from the
**local Vite dev server** (`http://localhost:8080`). For the HTTPS app you'll
need the service behind HTTPS (a reverse proxy / tunnel) or run it as a
same-origin backend later.

## Heavy training

Model training (papaya tree health, or a fine-tuned Qwen) happens on the
**Windows PC with a GPU**, not this VM — VirtualBox can't pass a GPU through.
The `qwen` backend is where that trained/served model plugs in via `QWEN_ENDPOINT`
(e.g. an Ollama server on the Windows PC).
