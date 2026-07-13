"""Qwen2.5-VL backend — the FOSS "Claude Vision equivalent" for reading receipts.

Tier-2 path from the plan: an open-weight vision model that returns receipt text.
The local dev box has too little VRAM to run it, so it runs remotely. Two modes,
auto-selected by whether QWEN_API_KEY is set:

  * Ollama mode (no API key) — self-hosted `ollama serve` on a GPU box.
    QWEN_ENDPOINT points at it (e.g. http://192.168.1.50:11434); POSTs to
    /api/generate. Cheapest when you already own/rent the GPU.

  * OpenAI-compatible mode (QWEN_API_KEY set) — any managed provider that hosts
    Qwen-VL behind an OpenAI-style /chat/completions endpoint (DashScope,
    OpenRouter, Together, Fireworks, vLLM's own OpenAI server, ...). Provider-
    agnostic: you supply the base URL, model id, and key. Best for low/bursty
    volume — pay per image instead of renting a GPU 24/7.

Drop-in with the other backends either way: `recognize` returns plain text, one
line per receipt line, so the web app's parser (`src/lib/receipts.ts`) consumes
it unchanged. Structured-JSON field extraction is a deliberate future phase; see
the note at the bottom.
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
        # Base URL of the server. Ollama: http://host:11434. Managed provider:
        # the OpenAI-compatible base, e.g. https://openrouter.ai/api/v1.
        self._endpoint = os.getenv("QWEN_ENDPOINT")
        if not self._endpoint:
            raise RuntimeError(
                "QwenBackend not configured. Set QWEN_ENDPOINT to an Ollama/vLLM "
                "server or a managed provider's OpenAI-compatible base URL, or run "
                "the service with OCR_BACKEND=paddle on the VM. See "
                "backends/qwen_backend.py for wiring notes."
            )
        self._endpoint = self._endpoint.rstrip("/")
        self._timeout = float(os.getenv("QWEN_TIMEOUT", "120"))

        # An API key switches us to provider-agnostic OpenAI-compatible mode.
        self._api_key = os.getenv("QWEN_API_KEY")
        if self._api_key:
            # Managed mode SENDS EACH IMAGE TO A THIRD PARTY. Receipts are tax
            # records (LHDN 7-yr retention) and cross-border egress has PDPA
            # implications — so require an explicit opt-in rather than letting a
            # stray QWEN_API_KEY silently route sensitive data off-box. Self-host
            # (Ollama/vLLM, no key) or paddle for critical data.
            if os.getenv("QWEN_ALLOW_MANAGED", "").lower() not in ("1", "true", "yes"):
                raise RuntimeError(
                    "Managed-API (third-party) mode is a data-egress path: each "
                    "image is sent to the provider at QWEN_ENDPOINT. For critical "
                    "data self-host Qwen (unset QWEN_API_KEY) or use OCR_BACKEND="
                    "paddle. To deliberately allow the managed API, set "
                    "QWEN_ALLOW_MANAGED=true. See README 'Enable the Qwen backend'."
                )
            # Managed providers use fuller model ids, e.g. "qwen/qwen2.5-vl-7b-instruct".
            self._model = os.getenv("QWEN_MODEL", "qwen2.5-vl-7b-instruct")
        else:
            self._model = os.getenv("QWEN_MODEL", "qwen2.5vl")

    def recognize(self, image_bytes: bytes) -> str:
        img_b64 = base64.b64encode(image_bytes).decode("ascii")
        if self._api_key:
            return self._recognize_openai(img_b64)
        return self._recognize_ollama(img_b64)

    def _recognize_ollama(self, img_b64: str) -> str:
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

    def _recognize_openai(self, img_b64: str) -> str:
        """Provider-agnostic OpenAI-compatible /chat/completions call."""
        resp = requests.post(
            f"{self._endpoint}/chat/completions",
            headers={"Authorization": f"Bearer {self._api_key}"},
            json={
                "model": self._model,
                "temperature": 0,  # deterministic for OCR
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": _TRANSCRIBE_PROMPT},
                        {"type": "image_url",
                         "image_url": {"url": f"data:image/png;base64,{img_b64}"}},
                    ],
                }],
            },
            timeout=self._timeout,
        )
        resp.raise_for_status()
        choices = resp.json().get("choices") or [{}]
        return (choices[0].get("message", {}).get("content") or "").strip()


# Phase 2 (structured extraction): swap _TRANSCRIBE_PROMPT for the Malay
# field-extraction prompt and pass Ollama `format="json"` (or, in OpenAI mode,
# response_format={"type":"json_object"} / guided_json) to get
# {merchant, total, tax, date, category} directly. That returns JSON, not
# newline text, so add a separate recognize_structured()/`/ocr/structured` path
# rather than overloading recognize() — receipts.ts would consume the JSON
# instead of parsing lines.
