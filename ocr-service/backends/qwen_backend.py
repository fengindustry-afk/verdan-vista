"""Qwen2.5-VL backend — the FOSS "Claude Vision equivalent", self-hosted on a GPU.

Tier-2 path from the plan: an open-weight vision model that reads receipts. It
needs a GPU, so it is NOT run on the VirtualBox VM — enable it on the Windows PC
(or a future cloud box) by pointing QWEN_ENDPOINT at a running Ollama server
(`ollama run qwen2.5vl`), then set OCR_BACKEND=qwen.

Drop-in with the other backends: `recognize` returns plain text, one line per
receipt line, so the web app's parser (`src/lib/receipts.ts`) consumes it
unchanged. Structured-JSON field extraction (merchant/total/tax/date/category)
is a deliberate future phase — it would return JSON instead of lines and so
needs its own method/endpoint plus a parser change; see the note at the bottom.
"""

from __future__ import annotations

import base64
import os

import requests

from .base import OcrBackend

# Ask for a faithful transcription only — no reformatting, no JSON — so the
# output matches what PaddleOCR/Tesseract produce and receipts.ts expects.
_TRANSCRIBE_PROMPT = (
    "Transcribe every line of text in this receipt exactly as printed, "
    "preserving line breaks and reading order top to bottom. "
    "Output only the raw text — no commentary, no markdown, no code fences."
)


class QwenBackend(OcrBackend):
    name = "qwen"

    def __init__(self) -> None:
        # e.g. "http://192.168.1.50:11434" for an Ollama server on the GPU PC.
        self._endpoint = os.getenv("QWEN_ENDPOINT")
        if not self._endpoint:
            raise RuntimeError(
                "QwenBackend not configured. Set QWEN_ENDPOINT to a running "
                "Ollama/vLLM server, or run the service with OCR_BACKEND=paddle "
                "on the VM. See backends/qwen_backend.py for wiring notes."
            )
        self._endpoint = self._endpoint.rstrip("/")
        self._model = os.getenv("QWEN_MODEL", "qwen2.5vl")
        self._timeout = float(os.getenv("QWEN_TIMEOUT", "120"))

    def recognize(self, image_bytes: bytes) -> str:
        img_b64 = base64.b64encode(image_bytes).decode("ascii")
        resp = requests.post(
            f"{self._endpoint}/api/generate",
            json={
                "model": self._model,
                "prompt": _TRANSCRIBE_PROMPT,
                "images": [img_b64],
                "stream": False,
                "options": {"temperature": 0},  # deterministic for OCR
            },
            timeout=self._timeout,
        )
        resp.raise_for_status()
        return resp.json().get("response", "").strip()


# Phase 2 (structured extraction): swap _TRANSCRIBE_PROMPT for the Malay
# field-extraction prompt and pass Ollama `format="json"` (or vLLM guided_json)
# to get {merchant, total, tax, date, category} directly. That returns JSON, not
# newline text, so add a separate recognize_structured()/`/ocr/structured` path
# rather than overloading recognize() — receipts.ts would consume the JSON
# instead of parsing lines.
