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
| `qwen` | **Remote GPU** | Qwen2.5-VL vision OCR. Runs remotely (local dev GPU too small); self-hosted Ollama **or** a managed API. See [Enable the Qwen backend](#enable-the-qwen-backend). |

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

## Enable the Qwen backend

Qwen2.5-VL is a vision model that reads receipts directly. The local dev GPU
(GTX 970, 4 GB) is too small to run it, so it runs **remotely**. The backend
auto-selects its mode by whether `QWEN_API_KEY` is set:

- **Managed API** (key set) — provider-agnostic OpenAI-compatible endpoint
  (OpenRouter, DashScope, Together, Fireworks…). Best for low/bursty receipt
  volume: pay per image (~sen each, roughly **MYR 5–30/mo for ~1k receipts**)
  instead of renting a GPU 24/7. **Recommended.**
- **Self-hosted Ollama** (no key) — `ollama serve` on a GPU box you own/rent;
  `QWEN_ENDPOINT` points at it. Cheaper only if the GPU is already paid for.

> Pricing is approximate and moves — confirm on the provider's live page.

### ⚠️ Data-sensitivity warning — read before using the managed API

Managed-API mode **sends every image to a third party**. Receipts are tax
records (LHDN 7-year retention) and may contain commercially sensitive figures;
sending them off-box raises **data-residency (PDPA)**, **provider retention /
training**, and **availability** concerns, and runs against the `mrv-hybrid-vision`
"own the pipeline, server-side keys" principle. Tier your data:

| Data | Sensitivity | Recommended path |
|---|---|---|
| Credit-issuance / MRV compliance | 🔴 critical | Never a third-party API. Controlled infra only. |
| Receipts (tax records) | 🟠 sensitive | `paddle` (local, no egress) or **self-hosted** Qwen. |
| Tree / scan health images | 🟢 low | Managed API is fine. |

For critical/production data, prefer **PaddleOCR** (fully local, zero egress) or
**self-hosted Qwen** (Ollama/vLLM on infra you control). Only use the managed
API for low-sensitivity images — and if for anything sensitive, require a
**zero-retention / no-training** tier, a documented region, a signed DPA, and
PDPA sign-off (a legal/procurement decision).

Because of this, the backend **refuses to start in managed-API mode unless you
explicitly opt in** with `QWEN_ALLOW_MANAGED=true` — a deliberate speed-bump so a
stray `QWEN_API_KEY` can't silently route sensitive receipts to a third party.

### Step by step (managed API)

**1. Get a provider key (you).** Create an account with a provider that hosts
Qwen2.5-VL (e.g. OpenRouter or DashScope), add billing, and generate an API key.
Treat it like a password — never commit it.

**2. Configure `.env`.** On the box running this service:

```bash
cd ocr-service
cp .env.example .env
```

Set in `.env` (OpenRouter shown; DashScope base URL/model are in `.env.example`):

```
OCR_BACKEND=qwen
QWEN_ENDPOINT=https://openrouter.ai/api/v1
QWEN_API_KEY=sk-your-real-key-here
QWEN_MODEL=qwen/qwen2.5-vl-7b-instruct
QWEN_ALLOW_MANAGED=true    # required opt-in to send images to a third party
```

**3. Install the extra dependency.** Uncomment `requests>=2.31` in
`requirements.txt`, then `pip install -r requirements.txt`.

**4. Smoke-test before starting the service** — drives the backend straight at
the provider, no FastAPI needed (needs `QWEN_API_KEY` in the environment):

```bash
python verify.py --qwen-endpoint https://openrouter.ai/api/v1
python verify.py --qwen-endpoint https://openrouter.ai/api/v1 --image ./receipt.jpg
```

Expect `mode=openai-compatible` and a transcription. On failure the hint names
the likely cause (base URL, model id, or key).

**5. Run and compare.** Start the service, confirm `/health` shows
`backend=qwen`, then run a few **real** Malaysian receipts through both `qwen`
and `paddle` (flip `OCR_BACKEND`) and keep whichever reads them better. If Qwen
doesn't beat Paddle on your receipts, set `OCR_BACKEND=paddle` — you've spent
only pennies testing and nothing else in the app changes.

### Self-hosted Ollama instead

Leave `QWEN_API_KEY` unset, run `ollama serve` (after `ollama pull qwen2.5vl`)
on a GPU box, and point `QWEN_ENDPOINT=http://<box-ip>:11434`. Secure that port —
don't expose it to the internet. Smoke-test the same way with `--qwen-endpoint`.

## Heavy training

Model training (papaya tree health, or a fine-tuned Qwen) happens on the
**Windows PC with a GPU**, not this VM — VirtualBox can't pass a GPU through.
The `qwen` backend is where that trained/served model plugs in via `QWEN_ENDPOINT`
(e.g. an Ollama server on the Windows PC).
