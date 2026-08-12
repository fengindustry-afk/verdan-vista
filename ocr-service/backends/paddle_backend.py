"""PaddleOCR backend — the recommended default. Apache-2.0, strong on skewed /
faded / mixed-language receipts, and fast enough on CPU for a VM.

First run downloads the detection + recognition + orientation models (~10-20 MB)
into the paddlex model cache, then reuses them offline.

Written against the PaddleOCR **3.x** API. 3.x renamed `use_angle_cls` to
`use_textline_orientation`, dropped `show_log`, replaced `.ocr(arr, cls=True)`
with `.predict(arr)`, and returns per-image result objects carrying parallel
`rec_texts` / `rec_polys` lists instead of `[box, (text, confidence)]` rows. None
of this is back-compatible, so requirements.txt floors paddleocr at 3.

Self-check (no paddle install needed):  python -m backends.paddle_backend
"""

from __future__ import annotations

import io
import sys

import numpy as np
from PIL import Image

from .base import OcrBackend

# Group text boxes whose vertical centres are within this fraction of the image
# height onto the same output line.
_LINE_TOL_FRAC = 0.012


def _lines_from_result(res, height: int) -> str:
    """Recognised text as newline-separated lines, top-to-bottom.

    `res` is one 3.x OCR result — a dict-like object whose `rec_texts` and
    `rec_polys` run in parallel (`rec_polys` are the boxes that survived
    recognition; `dt_polys` is the raw detector output, used only as a fallback
    for builds that omit the filtered set).
    """
    texts = res["rec_texts"] if "rec_texts" in res else []
    polys = res["rec_polys"] if "rec_polys" in res else res.get("dt_polys", [])
    if not texts:
        return ""

    # Top edge and left edge per box: order top-to-bottom, then left-to-right,
    # and break to a new line where the vertical gap exceeds the tolerance.
    entries = []
    for text, box in zip(texts, polys):
        ys = [float(p[1]) for p in box]
        xs = [float(p[0]) for p in box]
        entries.append((min(ys), min(xs), text))
    entries.sort(key=lambda e: (e[0], e[1]))

    # Group into lines first, order each line by x second. Sorting by (y, x) up
    # front does not give reading order: boxes sharing a line differ by a few
    # pixels of top edge, so a right-hand column sorts ahead of the label it
    # belongs to ("18.90 MINYAK 2L"). Rows are measured against the top of the
    # line being built, not the previous box, so a run of slightly descending
    # boxes cannot drift a whole line's worth without ever tripping the gap.
    tol = height * _LINE_TOL_FRAC
    rows: list[list[tuple[float, str]]] = []
    anchor_y: float | None = None
    for y, x, text in entries:
        if anchor_y is None or y - anchor_y > tol:
            rows.append([])
            anchor_y = y
        rows[-1].append((x, text))

    return "\n".join(" ".join(t for _x, t in sorted(row)) for row in rows)


class PaddleBackend(OcrBackend):
    name = "paddle"

    def __init__(self) -> None:
        from paddleocr import PaddleOCR

        # Text-line orientation classification handles receipts photographed
        # upside down / rotated (2.x called this use_angle_cls). Document
        # orientation and unwarping stay off: they load two more models for a
        # correction a hand-held receipt photo rarely needs, and they cost CPU
        # time on every request. lang="en" covers Latin script + digits
        # (Malaysian receipts are mostly English/Malay in Latin script). Switch
        # to "ch" if you hit Chinese merchant names that need it.
        # oneDNN is the fast CPU path and stays on where it works. The Windows
        # build of paddlepaddle 3.3 aborts inside the detector with
        # "ConvertPirAttribute2RuntimeAttribute not support ArrayAttribute", so
        # dev boxes fall back to the plain kernels — slower, same output. The
        # service itself deploys on Linux (run.sh), which keeps oneDNN.
        self._ocr = PaddleOCR(
            use_textline_orientation=True,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            lang="en",
            **({"enable_mkldnn": False} if sys.platform == "win32" else {}),
        )

    def recognize(self, image_bytes: bytes) -> str:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        # RGB -> BGR for PaddleOCR. ascontiguousarray because the reversed slice
        # is a negative-stride view, which the inference path will not take.
        arr = np.ascontiguousarray(np.array(img)[:, :, ::-1])
        height = arr.shape[0] or 1

        # One image in, one result out — but an empty list when nothing is read.
        result = self._ocr.predict(arr)
        if not result:
            return ""
        return _lines_from_result(result[0], height)


if __name__ == "__main__":
    # Grouping check against a hand-built 3.x-shaped result: two boxes on one
    # line, a third far enough below to break. Runs without paddle installed.
    box = lambda x, y: [[x, y], [x + 40, y], [x + 40, y + 10], [x, y + 10]]
    res = {
        "rec_texts": ["TOTAL", "12.50", "RM"],
        "rec_polys": [box(10, 100), box(200, 101), box(10, 40)],
    }
    assert _lines_from_result(res, 1000) == "RM\nTOTAL 12.50", _lines_from_result(res, 1000)
    assert _lines_from_result({"rec_texts": [], "rec_polys": []}, 1000) == ""
    # Reading order within a line follows x, not the box's top edge: the amount
    # sits a pixel higher than its label but still belongs after it.
    amount_first = {
        "rec_texts": ["18.90", "MINYAK 2L"],
        "rec_polys": [box(400, 100), box(30, 101)],
    }
    assert _lines_from_result(amount_first, 1000) == "MINYAK 2L 18.90"
    # A staircase whose steps each sit within tol (12px here) of the one above
    # still has to break: measured box-to-box it would run on forever, measured
    # from the top of the line "c" is 18px down and starts a new one.
    stair = {
        "rec_texts": ["a", "b", "c"],
        "rec_polys": [box(0, 0), box(0, 9), box(0, 18)],
    }
    assert _lines_from_result(stair, 1000) == "a b\nc", _lines_from_result(stair, 1000)
    # dt_polys stands in when a build omits the filtered set.
    assert _lines_from_result({"rec_texts": ["A"], "dt_polys": [box(0, 0)]}, 100) == "A"
    print("paddle_backend self-check ok")
