#!/usr/bin/env python3
"""
Sanity-check a running OCR service in one command.

  1. GET  /health   — confirms the service is up and which backend is active.
  2. POST /ocr      — runs a sample image through and prints the text + timing.

Uses only the standard library (plus Pillow, already a service dependency, to
synthesise a sample receipt when you don't pass your own image), so you can run
it inside the VM's venv with no extra install.

Usage:
    python verify.py                          # localhost:8000, synthetic image
    python verify.py --url http://192.168.1.42:8000
    python verify.py --image /path/to/receipt.jpg
    python verify.py --qwen-endpoint http://192.168.1.50:11434   # direct backend smoke test

The --qwen-endpoint flag skips the FastAPI service and drives the QwenBackend
straight against an Ollama/vLLM server, so you can confirm the GPU box is wired
up before switching OCR_BACKEND=qwen. It needs the `requests` dependency
(uncomment it in requirements.txt); the default run stays stdlib-only.
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import urllib.error
import urllib.request
import uuid


def _get(url: str, timeout: float) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _post_file(url: str, data: bytes, filename: str, timeout: float) -> dict:
    """Minimal multipart/form-data POST with field name 'file' (stdlib only)."""
    boundary = f"----esterra{uuid.uuid4().hex}"
    body = b"".join([
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode(),
        b"Content-Type: application/octet-stream\r\n\r\n",
        data,
        f"\r\n--{boundary}--\r\n".encode(),
    ])
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _sample_receipt_png() -> bytes:
    """Render a tiny fake receipt so the check works without a real image."""
    from PIL import Image, ImageDraw

    lines = [
        "99 SPEEDMART",
        "No 12 Jalan Test, KL",
        "Date: 10/07/2026",
        "Milk           5.50",
        "Bread          3.20",
        "SST 6%         0.52",
        "TOTAL          9.22",
    ]
    img = Image.new("RGB", (360, 240), "white")
    draw = ImageDraw.Draw(img)
    y = 12
    for ln in lines:
        draw.text((16, y), ln, fill="black")
        y += 30
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _smoke_qwen(endpoint: str, image_bytes: bytes) -> int:
    """Drive the QwenBackend directly against an Ollama/vLLM server."""
    import os
    import time

    os.environ["QWEN_ENDPOINT"] = endpoint
    try:
        from backends.qwen_backend import QwenBackend
    except ImportError as err:  # requests not installed
        print(f"[FAIL] qwen backend import failed: {err}")
        print("  Uncomment `requests` in requirements.txt and `pip install -r requirements.txt`.")
        return 1

    try:
        backend = QwenBackend()
    except RuntimeError as err:
        print(f"[FAIL] qwen backend config: {err}")
        return 1

    print(f"[..] qwen      calling {endpoint} (model={backend._model})")
    try:
        start = time.perf_counter()
        text = backend.recognize(image_bytes)
        ms = int((time.perf_counter() - start) * 1000)
    except Exception as err:  # network / HTTP / JSON errors from the server
        print(f"[FAIL] qwen      request failed: {err}")
        print("  Is the Ollama server up? Try: ollama run qwen2.5vl")
        return 1

    print(f"[OK] qwen      ms={ms}")
    print("--- recognised text " + "-" * 40)
    print(text or "(empty - check the image / model)")
    print("-" * 60)
    if not text.strip():
        print("[WARN] Backend reachable but read nothing from the image.")
        return 2
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Verify the Esterra OCR service.")
    ap.add_argument("--url", default="http://localhost:8000", help="Service base URL")
    ap.add_argument("--image", help="Path to an image to OCR (default: synthetic receipt)")
    ap.add_argument("--timeout", type=float, default=30.0, help="Per-request timeout (s)")
    ap.add_argument("--qwen-endpoint", help="Smoke-test QwenBackend directly against this Ollama/vLLM URL")
    args = ap.parse_args()
    base = args.url.rstrip("/")

    # Load the image once — shared by the service check and the qwen smoke test.
    if args.image:
        try:
            with open(args.image, "rb") as fh:
                image_bytes = fh.read()
            image_name = args.image.rsplit("/", 1)[-1]
        except OSError as err:
            print(f"[FAIL] could not read --image: {err}")
            return 1
    else:
        image_bytes = _sample_receipt_png()
        image_name = "sample.png"

    # Direct backend smoke test — skips the FastAPI service entirely.
    if args.qwen_endpoint:
        return _smoke_qwen(args.qwen_endpoint, image_bytes)

    # 1. health -------------------------------------------------------------
    try:
        health = _get(f"{base}/health", args.timeout)
        print(f"[OK] /health   -> {health}")
    except (urllib.error.URLError, OSError) as err:
        print(f"[FAIL] /health   -> unreachable: {err}")
        print(f"  Is the service running and bound to 0.0.0.0? Try: {base}/health")
        return 1

    # 2. ocr ----------------------------------------------------------------
    data, filename = image_bytes, image_name
    kind = filename if args.image else "synthetic receipt"
    print(f"[..] /ocr      posting {kind} ({len(data)} bytes)")

    try:
        result = _post_file(f"{base}/ocr", data, filename, args.timeout)
    except (urllib.error.URLError, OSError) as err:
        print(f"[FAIL] /ocr      failed: {err}")
        return 1

    text = result.get("text", "")
    print(f"[OK] /ocr      backend={result.get('backend')} ms={result.get('ms')}")
    print("--- recognised text " + "-" * 40)
    print(text or "(empty - check the image / backend)")
    print("-" * 60)

    if not text.strip():
        print("[WARN] No text recognised. The service works but read nothing from the image.")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
