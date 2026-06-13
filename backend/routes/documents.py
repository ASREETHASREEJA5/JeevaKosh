"""
Document routes — all scoped to the authenticated user.

POST   /hospitals/{hospital_id}/{folder}/upload  → upload file, trigger OCR
GET    /hospitals/{hospital_id}/{folder}          → list MY documents (sorted newest first)
GET    /documents/{document_id}                   → get MY document
GET    /documents/{document_id}/preview           → stream file for preview
DELETE /documents/{document_id}                   → delete MY document
"""

from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from backend.database import documents_col, hospitals_col
from backend.models.document import DocumentListItem, DocumentResponse
from backend.services.auth import get_current_user, get_current_user_preview
from backend.services.ocr_worker import run_ocr_for_document
from backend.services.storage import (
    ALLOWED_MIME_TYPES,
    VALID_FOLDERS,
    delete_file_from_gridfs,
    generate_unique_stored_filename,
    save_file_to_gridfs,
    stream_file_from_gridfs,
)

router = APIRouter(tags=["Documents"])

MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_oid(raw: str) -> ObjectId:
    try:
        return ObjectId(raw)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail=f"Invalid id: {raw}")


def _doc_to_response(doc: dict) -> DocumentResponse:
    return DocumentResponse(
        id=str(doc["_id"]),
        hospital_id=doc["hospital_id"],
        hospital_name=doc.get("hospital_name", ""),
        folder=doc["folder"],
        original_filename=doc["original_filename"],
        stored_filename=doc["stored_filename"],
        mime_type=doc["mime_type"],
        file_size=doc["file_size"],
        upload_date=doc["upload_date"],
        ocr_status=doc["ocr_status"],
        ocr_data=doc.get("ocr_data"),
        ocr_error=doc.get("ocr_error"),
        ocr_completed_at=doc.get("ocr_completed_at"),
    )


def _doc_to_list_item(doc: dict) -> DocumentListItem:
    return DocumentListItem(
        id=str(doc["_id"]),
        hospital_id=doc["hospital_id"],
        hospital_name=doc.get("hospital_name", ""),
        folder=doc["folder"],
        original_filename=doc["original_filename"],
        stored_filename=doc["stored_filename"],
        mime_type=doc["mime_type"],
        file_size=doc["file_size"],
        upload_date=doc["upload_date"],
        ocr_status=doc["ocr_status"],
    )


async def _assert_hospital_owned(hospital_id: str, user_id: str) -> dict:
    hospital = await hospitals_col.find_one(
        {"_id": _parse_oid(hospital_id), "user_id": user_id}
    )
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found.")
    return hospital


async def _get_owned_doc(document_id: str, user_id: str) -> dict:
    doc = await documents_col.find_one(
        {"_id": _parse_oid(document_id), "user_id": user_id}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return doc


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post(
    "/hospitals/{hospital_id}/{folder}/upload",
    response_model=DocumentResponse,
    status_code=201,
)
async def upload_document(
    hospital_id: str,
    folder: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    file: UploadFile = File(...),
):
    user_id = str(current_user["_id"])

    if folder not in VALID_FOLDERS:
        raise HTTPException(
            status_code=400,
            detail=f"folder must be one of {sorted(VALID_FOLDERS)}.",
        )

    hospital = await _assert_hospital_owned(hospital_id, user_id)

    mime_type = file.content_type or ""
    if mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{mime_type}'. Allowed: {list(ALLOWED_MIME_TYPES)}.",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum is {MAX_FILE_SIZE_BYTES // (1024*1024)} MB.",
        )

    original_filename = file.filename or f"upload{ALLOWED_MIME_TYPES[mime_type]}"
    stored_filename = await generate_unique_stored_filename(
        original_filename, hospital_id, folder
    )

    file_id = await save_file_to_gridfs(
        content=content,
        stored_filename=stored_filename,
        mime_type=mime_type,
        hospital_id=hospital_id,
        folder=folder,
    )

    doc_record = {
        "user_id": user_id,
        "hospital_id": hospital_id,
        "hospital_name": hospital["name"],
        "folder": folder,
        "original_filename": original_filename,
        "stored_filename": stored_filename,
        "file_id": str(file_id),
        "mime_type": mime_type,
        "file_size": len(content),
        "upload_date": datetime.now(timezone.utc),
        "ocr_status": "pending",
        "ocr_data": None,
        "ocr_error": None,
        "ocr_completed_at": None,
    }
    result = await documents_col.insert_one(doc_record)
    doc_record["_id"] = result.inserted_id

    background_tasks.add_task(run_ocr_for_document, str(result.inserted_id))

    return _doc_to_response(doc_record)


@router.get(
    "/hospitals/{hospital_id}/{folder}",
    response_model=list[DocumentListItem],
)
async def list_documents(
    hospital_id: str,
    folder: str,
    current_user: dict = Depends(get_current_user),
    skip: int = 0,
    limit: int = 50,
):
    user_id = str(current_user["_id"])

    if folder not in VALID_FOLDERS:
        raise HTTPException(
            status_code=400,
            detail=f"folder must be one of {sorted(VALID_FOLDERS)}.",
        )

    await _assert_hospital_owned(hospital_id, user_id)

    docs = (
        await documents_col.find(
            {"hospital_id": hospital_id, "folder": folder, "user_id": user_id}
        )
        .sort("upload_date", -1)
        .skip(skip)
        .limit(limit)
        .to_list(None)
    )
    return [_doc_to_list_item(d) for d in docs]


@router.get("/documents/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])
    doc = await _get_owned_doc(document_id, user_id)
    return _doc_to_response(doc)


@router.get("/documents/{document_id}/preview")
async def preview_document(
    document_id: str,
    token: str | None = None,
    current_user: dict = Depends(get_current_user_preview),
):
    user_id = str(current_user["_id"])
    doc = await _get_owned_doc(document_id, user_id)

    return StreamingResponse(
        stream_file_from_gridfs(doc["file_id"]),
        media_type=doc["mime_type"],
        headers={
            "Content-Disposition": f'inline; filename="{doc["stored_filename"]}"',
            "Cache-Control": "private, max-age=3600",
        },
    )


@router.delete("/documents/{document_id}", status_code=200)
async def delete_document(
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])
    doc = await _get_owned_doc(document_id, user_id)

    try:
        await delete_file_from_gridfs(doc["file_id"])
    except Exception:
        pass

    await documents_col.delete_one({"_id": _parse_oid(document_id)})
    return {"message": f"Document '{doc['stored_filename']}' deleted."}
