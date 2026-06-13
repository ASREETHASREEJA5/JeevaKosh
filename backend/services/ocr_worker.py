"""
Background OCR worker.

Called via FastAPI BackgroundTasks immediately after a file is uploaded.
Runs the blocking OCR extraction in a thread pool so the event loop is
never blocked, then persists the result in the 'documents' collection.
"""

import asyncio
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId

from backend.database import documents_col
from backend.services import ocr as ocr_service
from backend.services.storage import read_file_bytes_from_gridfs


async def run_ocr_for_document(document_id: str) -> None:
    """
    Async background task:
      1. Mark document as 'processing'
      2. Download file from GridFS
      3. Write to a temp file
      4. Run sync OCR in a thread pool (asyncio.to_thread)
      5. Save extracted JSON back to the document
      6. Mark as 'completed' or 'failed'
    """
    doc_id = ObjectId(document_id)
    tmp_path: str | None = None

    # ── Step 1: mark processing ───────────────────────────────────────────────
    await documents_col.update_one(
        {"_id": doc_id},
        {"$set": {"ocr_status": "processing", "ocr_error": None}},
    )

    try:
        # ── Step 2: fetch document metadata ───────────────────────────────────
        doc = await documents_col.find_one({"_id": doc_id})
        if not doc:
            return  # document was deleted before OCR could run

        # ── Step 3: download file bytes from GridFS ───────────────────────────
        file_bytes = await read_file_bytes_from_gridfs(str(doc["file_id"]))

        # ── Step 4: write to temp file ────────────────────────────────────────
        suffix = Path(doc["stored_filename"]).suffix.lower()
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        # ── Step 5: determine document type from folder ───────────────────────
        doc_type = "prescription" if doc["folder"] == "prescriptions" else "report"

        # ── Step 6: run OCR in thread pool (blocking call) ────────────────────
        ocr_data: dict = await asyncio.to_thread(
            ocr_service.extract_from_file, tmp_path, doc_type
        )

        # ── Step 6b: override report_type with the user-defined sub-folder name ──
        # This prevents the AI from guessing the report category (e.g. "KFT" vs
        # "kidney function test"). The sub-folder name IS the authoritative type.
        report_folder_name: str | None = doc.get("report_folder_name")
        if report_folder_name and isinstance(ocr_data, dict):
            ocr_data["report_type"] = report_folder_name
            # Handle multi-page PDFs where each page has its own dict
            if ocr_data.get("multi_page") and isinstance(ocr_data.get("pages"), list):
                for page in ocr_data["pages"]:
                    if isinstance(page, dict):
                        page["report_type"] = report_folder_name

        # ── Step 7: persist result ────────────────────────────────────────────
        await documents_col.update_one(
            {"_id": doc_id},
            {
                "$set": {
                    "ocr_status": "completed",
                    "ocr_data": ocr_data,
                    "ocr_completed_at": datetime.now(timezone.utc),
                    "ocr_error": None,
                }
            },
        )

    except Exception as exc:
        await documents_col.update_one(
            {"_id": doc_id},
            {
                "$set": {
                    "ocr_status": "failed",
                    "ocr_error": str(exc),
                }
            },
        )

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
