"""PaddleOCR backend — the recommended default. Apache-2.0, strong on skewed /
faded / mixed-language receipts, and fast enough on CPU for a VM.

First run downloads the detection + recognition + angle-classification models
(~10-20 MB) into ~/.paddleocr, then reuses them offline.
"""

from __future__ import annotations

import io

import numpy as np
from PIL import Image

from .base import OcrBackend

# Group text boxes whose vertical centres are within this fraction of the image
# height onto the same output line.
_LINE_TOL_FRAC = 0.012


class PaddleBackend(OcrBackend):
    name = "paddle"

    def __init__(self) -> None:
        from paddleocr import PaddleOCR

        # angle classification handles receipts photographed upside down / rotated.
        # lang="en" covers Latin script + digits (Malaysian receipts are mostly
        # English/Malay in Latin script). Switch to "ch" if you hit Chinese
        # merchant names that need it.
        self._ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)

    def recognize(self, image_bytes: bytes) -> str:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        arr = np.array(img)[:, :, ::-1]  # RGB -> BGR for PaddleOCR
        height = arr.shape[0] or 1

        result = self._ocr.ocr(arr, cls=True)
        # PaddleOCR returns a list-per-image; a single image yields result[0],
        # which can be None when nothing is detected.
        page = result[0] if result else None
        if not page:
            return ""

        # Each entry: [box(4 points), (text, confidence)]. Order top-to-bottom,
        # then left-to-right, and insert newlines where the vertical gap is large.
        entries = []
        for box, (text, _conf) in page:
            ys = [p[1] for p in box]
            xs = [p[0] for p in box]
            entries.append((min(ys), min(xs), text))
        entries.sort(key=lambda e: (e[0], e[1]))

        tol = height * _LINE_TOL_FRAC
        lines: list[str] = []
        current: list[str] = []
        last_y: float | None = None
        for y, _x, text in entries:
            if last_y is not None and abs(y - last_y) > tol:
                lines.append(" ".join(current))
                current = []
            current.append(text)
            last_y = y
        if current:
            lines.append(" ".join(current))

        return "\n".join(lines)
