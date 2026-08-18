"""
DocSaarthi — PaddleOCR Sidecar Service
FastAPI wrapper around PaddleOCR for Hindi + English OCR
"""

import os
import time
import uuid
import base64
import tempfile
import logging
from typing import Optional
from pathlib import Path

import numpy as np
from PIL import Image
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from paddleocr import PaddleOCR

# ----------------------------------------------------------------
# Logging
# ----------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("paddle-ocr-sidecar")

# ----------------------------------------------------------------
# FastAPI app
# ----------------------------------------------------------------
app = FastAPI(
    title="DocSaarthi OCR Sidecar",
    description="PaddleOCR service for Hindi and English document OCR",
    version="1.0.0",
)

# ----------------------------------------------------------------
# PaddleOCR initialization (lazy, loaded once at startup)
# ----------------------------------------------------------------
_ocr_instance: Optional[PaddleOCR] = None


def get_ocr() -> PaddleOCR:
    """Returns the singleton PaddleOCR instance, initializing if needed."""
    global _ocr_instance
    if _ocr_instance is None:
        logger.info("Initializing PaddleOCR (lang=ch for Hindi+English support)...")
        start = time.time()
        _ocr_instance = PaddleOCR(
            use_angle_cls=True,
            lang="ch",  # 'ch' supports Devanagari-like scripts + English
            show_log=False,
            use_gpu=False,  # Set to True if GPU is available
            enable_mkldnn=False,
        )
        logger.info(f"PaddleOCR initialized in {time.time() - start:.2f}s")
    return _ocr_instance


# ----------------------------------------------------------------
# Request / Response models
# ----------------------------------------------------------------
class OcrRequest(BaseModel):
    """OCR request — accepts either a file path or base64-encoded image."""
    image_path: Optional[str] = Field(None, description="Absolute path to image file")
    image_base64: Optional[str] = Field(None, description="Base64-encoded image data")
    page_number: int = Field(1, description="Page number for metadata")
    language_hint: Optional[str] = Field(None, description="Language hint: hi, en, or None")


class OcrBlock(BaseModel):
    id: str
    text: str
    bbox: list[float]  # [x1, y1, x2, y2]
    confidence: float
    reading_order: int
    block_type: str = "paragraph"


class OcrResponse(BaseModel):
    page_number: int
    width: int
    height: int
    blocks: list[OcrBlock]
    raw_text: str
    page_confidence: float
    page_language: str
    processing_time_ms: int
    provider: str = "paddle"
    fallback_used: bool = False


# ----------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------
def detect_language(text: str) -> str:
    """Detect script type: hi, en, or hi+en."""
    devanagari = sum(1 for c in text if '\u0900' <= c <= '\u097F')
    latin = sum(1 for c in text if c.isalpha() and c.isascii())
    total = devanagari + latin
    if total == 0:
        return "unknown"
    deva_ratio = devanagari / total
    if deva_ratio > 0.6:
        return "hi"
    if deva_ratio < 0.2:
        return "en"
    return "hi+en"


def paddle_bbox_to_flat(box) -> list[float]:
    """Convert PaddleOCR [[x1,y1],[x2,y1],[x2,y2],[x1,y2]] to [x1,y1,x2,y2]."""
    xs = [p[0] for p in box]
    ys = [p[1] for p in box]
    return [min(xs), min(ys), max(xs), max(ys)]


def load_image(request: OcrRequest) -> tuple[np.ndarray, int, int]:
    """Load image from path or base64, return (array, width, height)."""
    if request.image_path:
        if not os.path.exists(request.image_path):
            raise HTTPException(status_code=404, detail=f"Image not found: {request.image_path}")
        img = Image.open(request.image_path).convert("RGB")
    elif request.image_base64:
        data = base64.b64decode(request.image_base64)
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        img = Image.open(tmp_path).convert("RGB")
        os.unlink(tmp_path)
    else:
        raise HTTPException(status_code=400, detail="Provide either image_path or image_base64")

    width, height = img.size
    return np.array(img), width, height


# ----------------------------------------------------------------
# Routes
# ----------------------------------------------------------------
@app.get("/health")
def health_check():
    """Health check endpoint — also warms up PaddleOCR if not already loaded."""
    try:
        get_ocr()  # Ensures OCR is initialized
        return {"status": "ok", "provider": "paddle", "gpu": False}
    except Exception as e:
        return JSONResponse(status_code=503, content={"status": "error", "detail": str(e)})


@app.post("/ocr", response_model=OcrResponse)
def run_ocr(request: OcrRequest):
    """
    Run OCR on an image and return structured results.
    Supports Hindi (Devanagari) and English text.
    """
    start_time = time.time()

    try:
        img_array, width, height = load_image(request)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to load image: {e}")
        raise HTTPException(status_code=422, detail=f"Cannot load image: {str(e)}")

    ocr = get_ocr()

    try:
        result = ocr.ocr(img_array, cls=True)
    except Exception as e:
        logger.error(f"PaddleOCR failed: {e}")
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")

    # PaddleOCR returns: [[[box, (text, score)], ...], ...]
    # result[0] is the list of detected text blocks
    blocks: list[OcrBlock] = []
    all_text_parts: list[str] = []

    if result and result[0]:
        for idx, line in enumerate(result[0]):
            box, (text, score) = line
            if not text or not text.strip():
                continue

            flat_bbox = paddle_bbox_to_flat(box)
            lang = detect_language(text)

            block = OcrBlock(
                id=f"block_{request.page_number}_{idx}",
                text=text.strip(),
                bbox=flat_bbox,
                confidence=round(float(score), 4),
                reading_order=idx,
                block_type="paragraph",
            )
            blocks.append(block)
            all_text_parts.append(text.strip())

    raw_text = "\n".join(all_text_parts)
    page_confidence = (
        round(sum(b.confidence for b in blocks) / len(blocks), 4) if blocks else 0.0
    )
    page_language = detect_language(raw_text)
    processing_time_ms = int((time.time() - start_time) * 1000)

    logger.info(
        f"Page {request.page_number}: {len(blocks)} blocks, "
        f"confidence={page_confidence:.2f}, lang={page_language}, "
        f"time={processing_time_ms}ms"
    )

    return OcrResponse(
        page_number=request.page_number,
        width=width,
        height=height,
        blocks=blocks,
        raw_text=raw_text,
        page_confidence=page_confidence,
        page_language=page_language,
        processing_time_ms=processing_time_ms,
    )


@app.on_event("startup")
async def startup_event():
    """Pre-warm the OCR model on startup."""
    logger.info("Starting DocSaarthi OCR Sidecar...")
    try:
        get_ocr()
        logger.info("OCR sidecar ready.")
    except Exception as e:
        logger.error(f"Failed to initialize OCR: {e}")
