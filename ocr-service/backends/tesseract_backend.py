"""Tesseract backend — an even-lighter option (no PaddlePaddle install) if you
just want a server-side mirror of the browser engine. Requires the system
`tesseract-ocr` package plus the `pytesseract` Python wrapper.

    sudo apt-get install tesseract-ocr
    pip install pytesseract
"""

from __future__ import annotations

import io

from PIL import Image

from .base import OcrBackend


class TesseractBackend(OcrBackend):
    name = "tesseract"

    def __init__(self) -> None:
        import pytesseract  # noqa: F401  (import-time check that it's installed)

        self._pt = pytesseract

    def recognize(self, image_bytes: bytes) -> str:
        img = Image.open(io.BytesIO(image_bytes)).convert("L")  # grayscale
        # PSM 6: assume a single uniform block of text — same mode the browser
        # worker uses, keeping line structure intact for the receipt parser.
        return self._pt.image_to_string(img, config="--psm 6")
