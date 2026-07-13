"""Qwen2.5-VL backend — the FOSS "Claude Vision equivalent", STUBBED for now.

This is the Tier-2 path from the plan: a self-hosted open-weight vision model
that returns structured fields (merchant, total, tax, date, category) instead of
raw text, using the same Malay extraction prompt + validation as the client's
reference `index.js`. It needs a GPU, so it is NOT run on the VirtualBox VM —
enable it on the Windows PC (or a future cloud box) once a GPU is available.

Two ways to implement when you're ready:
  1. Point at a local Ollama server:  `ollama run qwen2.5vl`  then POST the image
     to http://localhost:11434/api/generate with the extraction prompt.
  2. Run vLLM / transformers directly and generate here.

Left unimplemented on purpose so the service runs today on CPU with `paddle`.
"""

from __future__ import annotations

import os

from .base import OcrBackend

_EXTRACTION_HINT = "Return the receipt text; structured JSON extraction TBD."


class QwenBackend(OcrBackend):
    name = "qwen"

    def __init__(self) -> None:
        # e.g. "http://localhost:11434" for an Ollama server on the Windows PC.
        self._endpoint = os.getenv("QWEN_ENDPOINT")
        if not self._endpoint:
            raise RuntimeError(
                "QwenBackend not configured. Set QWEN_ENDPOINT to a running "
                "Ollama/vLLM server, or run the service with OCR_BACKEND=paddle "
                "on the VM. See backends/qwen_backend.py for wiring notes."
            )

    def recognize(self, image_bytes: bytes) -> str:  # pragma: no cover - stub
        raise NotImplementedError(
            "Qwen2.5-VL backend is a stub. Wire it to your GPU host (Ollama or "
            f"vLLM) before enabling. Hint: {_EXTRACTION_HINT}"
        )
