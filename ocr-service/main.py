"""
Esterra OCR service — a small FastAPI app that turns a receipt (or any) image
into text, so the web app can hand off OCR to a stronger engine than the
in-browser Tesseract fallback.

Design goals (matches the "FOSS, self-hosted, own-the-stack" plan):
  • Runs fine CPU-only on an Ubuntu VirtualBox VM — no GPU, no cloud, no fees.
  • Pluggable backend: PaddleOCR now (best CPU FOSS OCR), a Qwen2.5-VL stub for
    later when a GPU is available for Claude-Vision-style structured extraction.
  • Same response shape the browser already expects: {"text": "..."} — so the
    app can swap engines with zero change to its receipt parser.

Run:
    pip install -r requirements.txt
    OCR_BACKEND=paddle uvicorn main:app --host 0.0.0.0 --port 8000

Health check:  GET  /health   -> {"status": "ok", "backend": "paddle"}
OCR:           POST /ocr       (multipart form field "file") -> {"text": ...}
"""

from __future__ import annotations

import os
import time

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from backends import get_backend

# --- config (environment-driven, never hardcode hosts/keys) ------------------
BACKEND_NAME = os.getenv("OCR_BACKEND", "paddle")  # paddle | tesseract | qwen
# Comma-separated list of web-app origins allowed to call this service from a
# browser. Default covers the local Vite dev server. Set OCR_CORS_ORIGINS to a
# comma list (or "*") for other setups.
CORS_ORIGINS = os.getenv(
    "OCR_CORS_ORIGINS",
    "http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173",
).split(",")
# Reject absurdly large uploads early (the app already compresses to <200KB).
MAX_BYTES = int(os.getenv("OCR_MAX_BYTES", str(8 * 1024 * 1024)))  # 8 MB

app = FastAPI(title="Esterra OCR", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if CORS_ORIGINS == ["*"] else [o.strip() for o in CORS_ORIGINS],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

# Instantiate the backend once at startup — loading OCR models is expensive, so
# we do it a single time and reuse it across requests.
backend = get_backend(BACKEND_NAME)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "backend": backend.name}


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)) -> dict:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large")

    started = time.perf_counter()
    try:
        text = backend.recognize(data)
    except Exception as err:  # surface a clean 500 rather than a stack trace
        raise HTTPException(status_code=500, detail=f"OCR failed: {err}") from err

    return {
        "text": text,
        "backend": backend.name,
        "ms": round((time.perf_counter() - started) * 1000),
    }
