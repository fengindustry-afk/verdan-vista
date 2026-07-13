"""Pluggable OCR backends. Select one via the OCR_BACKEND env var."""

from __future__ import annotations

from .base import OcrBackend


def get_backend(name: str) -> OcrBackend:
    """Instantiate a backend by name. Imports are lazy so you only need the
    dependencies for the backend you actually run."""
    key = (name or "paddle").strip().lower()
    if key == "paddle":
        from .paddle_backend import PaddleBackend
        return PaddleBackend()
    if key == "tesseract":
        from .tesseract_backend import TesseractBackend
        return TesseractBackend()
    if key == "qwen":
        from .qwen_backend import QwenBackend
        return QwenBackend()
    raise ValueError(f"Unknown OCR_BACKEND '{name}' (expected: paddle | tesseract | qwen)")
