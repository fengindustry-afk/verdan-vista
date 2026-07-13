"""Backend interface. A backend takes raw image bytes and returns plain text
with newlines between detected lines — the exact shape the web app's existing
receipt parser (`src/lib/receipts.ts`) already consumes."""

from __future__ import annotations

from abc import ABC, abstractmethod


class OcrBackend(ABC):
    #: Short identifier reported by /health and echoed in the /ocr response.
    name: str = "base"

    @abstractmethod
    def recognize(self, image_bytes: bytes) -> str:
        """Return recognised text, one line per detected text line."""
        raise NotImplementedError
