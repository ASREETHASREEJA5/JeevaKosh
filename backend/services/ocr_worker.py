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
from backend.services.embedding import get_document_embedding
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
        report_folder_name: str | None = doc.get("report_folder_name")

        # ── Step 6: run OCR in thread pool (blocking call) ────────────────────
        # For reports, report_folder_name selects Blood Test or Diabetes extraction profile.
        ocr_data: dict = await asyncio.to_thread(
            ocr_service.extract_from_file,
            tmp_path,
            doc_type,
            report_folder_name,
        )

        # Ensure report_type matches the sub-folder name on every page
        if report_folder_name and isinstance(ocr_data, dict):
            ocr_data["report_type"] = report_folder_name
            if ocr_data.get("multi_page") and isinstance(ocr_data.get("pages"), list):
                for page in ocr_data["pages"]:
                    if isinstance(page, dict):
                        page["report_type"] = report_folder_name

        # ── Step 7: generate vector embedding from the extracted text ────────
        # Runs in a thread pool (blocking HTTP call) so the event loop is free.
        # Embedding failure is non-fatal — OCR result is still saved.
        embedding: list[float] = []
        try:
            embedding = await asyncio.to_thread(get_document_embedding, ocr_data)
        except Exception as emb_exc:
            # Log but don't raise — embedding is optional; OCR data must be saved.
            print(f"[embedding] warning: failed for {document_id}: {emb_exc}")

        # ── Step 8: persist OCR result + embedding in a single atomic update ──
        await documents_col.update_one(
            {"_id": doc_id},
            {
                "$set": {
                    "ocr_status": "completed",
                    "ocr_data": ocr_data,
                    "ocr_completed_at": datetime.now(timezone.utc),
                    "ocr_error": None,
                    "embedding": embedding,   # [] if embedding failed or text was empty
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
