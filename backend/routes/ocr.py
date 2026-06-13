"""
OCR routes — all scoped to the authenticated user.

GET  /documents/{document_id}/ocr         → get extracted OCR data (MY document)
GET  /documents/{document_id}/ocr/status  → get OCR status (MY document)
POST /documents/{document_id}/ocr/retry   → re-trigger OCR (MY failed document)
"""

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from backend.database import documents_col
from backend.services.auth import get_current_user
from backend.services.ocr_worker import run_ocr_for_document

router = APIRouter(prefix="/documents", tags=["OCR"])


def _parse_oid(raw: str) -> ObjectId:
    try:
        return ObjectId(raw)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail=f"Invalid id: {raw}")


async def _get_owned_doc(document_id: str, user_id: str, projection: dict) -> dict:
    doc = await documents_col.find_one(
        {"_id": _parse_oid(document_id), "user_id": user_id},
        projection,
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return doc


@router.get("/{document_id}/ocr/status")
async def get_ocr_status(
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])
    doc = await _get_owned_doc(
        document_id, user_id,
        {"ocr_status": 1, "ocr_error": 1, "ocr_completed_at": 1},
    )
    return {
        "document_id": document_id,
        "ocr_status": doc["ocr_status"],
        "ocr_error": doc.get("ocr_error"),
        "ocr_completed_at": doc.get("ocr_completed_at"),
    }


@router.get("/{document_id}/ocr")
async def get_ocr_result(
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])
    doc = await _get_owned_doc(
        document_id, user_id,
        {"ocr_status": 1, "ocr_data": 1, "ocr_error": 1, "ocr_completed_at": 1,
         "stored_filename": 1, "folder": 1},
    )

    status = doc["ocr_status"]
    if status == "pending":
        raise HTTPException(status_code=409, detail="OCR has not started yet.")
    if status == "processing":
        raise HTTPException(status_code=409, detail="OCR is currently running.")
    if status == "failed":
        raise HTTPException(
            status_code=422,
            detail={"message": "OCR extraction failed.", "ocr_error": doc.get("ocr_error")},
        )

    return {
        "document_id": document_id,
        "stored_filename": doc.get("stored_filename"),
        "folder": doc.get("folder"),
        "ocr_status": status,
        "ocr_completed_at": doc.get("ocr_completed_at"),
        "ocr_data": doc.get("ocr_data"),
    }


@router.post("/{document_id}/ocr/retry", status_code=202)
async def retry_ocr(
    document_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])
    doc = await _get_owned_doc(document_id, user_id, {"ocr_status": 1})

    if doc["ocr_status"] not in ("failed", "pending"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot retry: OCR status is '{doc['ocr_status']}'.",
        )

    background_tasks.add_task(run_ocr_for_document, document_id)
    return {"message": "OCR re-queued.", "document_id": document_id, "ocr_status": "pending"}
