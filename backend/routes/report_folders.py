"""
Report Sub-folder routes.

Users can create named sub-folders inside a hospital's Reports section
(e.g. "Kidney Test", "Blood Test", "Thyroid Panel").  Each uploaded file
is tagged with the sub-folder name, which becomes the OCR report_type —
so the AI never needs to guess the report category.

POST   /hospitals/{hospital_id}/reports/folders                     → create sub-folder
GET    /hospitals/{hospital_id}/reports/folders                     → list sub-folders
DELETE /hospitals/{hospital_id}/reports/folders/{rf_id}            → delete sub-folder + all its docs
POST   /hospitals/{hospital_id}/reports/folders/{rf_id}/upload     → upload file into sub-folder
GET    /hospitals/{hospital_id}/reports/folders/{rf_id}/documents  → list docs in sub-folder
"""

import re
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from backend.database import documents_col, hospitals_col, report_folders_col
from backend.models.document import DocumentListItem, DocumentResponse
from backend.services.auth import get_current_user, get_current_user_preview
from backend.services.ocr_worker import run_ocr_for_document
from backend.services.storage import (
    ALLOWED_MIME_TYPES,
    delete_file_from_gridfs,
    generate_unique_stored_filename,
    save_file_to_gridfs,
    stream_file_from_gridfs,
)
from fastapi.responses import StreamingResponse

router = APIRouter(tags=["Report Folders"])

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


# ── Pydantic models ───────────────────────────────────────────────────────────

class ReportFolderCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)


class ReportFolderResponse(BaseModel):
    id: str
    hospital_id: str
    name: str
    slug: str
    created_at: datetime
    total_documents: int = 0


# ── Helpers ───────────────────────────────────────────────────────────────────

def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _parse_oid(raw: str) -> ObjectId:
    try:
        return ObjectId(raw)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail=f"Invalid id: {raw}")


async def _get_owned_hospital(hospital_id: str, user_id: str) -> dict:
    hospital = await hospitals_col.find_one(
        {"_id": _parse_oid(hospital_id), "user_id": user_id}
    )
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found.")
    return hospital


async def _get_owned_rf(rf_id: str, user_id: str) -> dict:
    rf = await report_folders_col.find_one(
        {"_id": _parse_oid(rf_id), "user_id": user_id}
    )
    if not rf:
        raise HTTPException(status_code=404, detail="Report folder not found.")
    return rf


async def _build_rf_response(rf: dict) -> ReportFolderResponse:
    total = await documents_col.count_documents(
        {"report_folder_id": str(rf["_id"])}
    )
    return ReportFolderResponse(
        id=str(rf["_id"]),
        hospital_id=rf["hospital_id"],
        name=rf["name"],
        slug=rf["slug"],
        created_at=rf["created_at"],
        total_documents=total,
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
        report_folder_id=doc.get("report_folder_id"),
        report_folder_name=doc.get("report_folder_name"),
    )


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
        report_folder_id=doc.get("report_folder_id"),
        report_folder_name=doc.get("report_folder_name"),
    )


# ── Sub-folder CRUD ───────────────────────────────────────────────────────────

@router.post(
    "/hospitals/{hospital_id}/reports/folders",
    response_model=ReportFolderResponse,
    status_code=201,
)
async def create_report_folder(
    hospital_id: str,
    data: ReportFolderCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a named sub-folder inside a hospital's Reports section."""
    user_id = str(current_user["_id"])
    await _get_owned_hospital(hospital_id, user_id)

    slug = _slugify(data.name)
    if await report_folders_col.find_one(
        {"hospital_id": hospital_id, "user_id": user_id, "slug": slug}
    ):
        raise HTTPException(
            status_code=409,
            detail=f"A folder named '{data.name}' already exists in this hospital's reports.",
        )

    doc = {
        "hospital_id": hospital_id,
        "user_id": user_id,
        "name": data.name.strip(),
        "slug": slug,
        "created_at": datetime.now(timezone.utc),
    }
    result = await report_folders_col.insert_one(doc)
    doc["_id"] = result.inserted_id
    return await _build_rf_response(doc)


@router.get(
    "/hospitals/{hospital_id}/reports/folders",
    response_model=list[ReportFolderResponse],
)
async def list_report_folders(
    hospital_id: str,
    current_user: dict = Depends(get_current_user),
):
    """List all report sub-folders for a hospital, sorted by creation date."""
    user_id = str(current_user["_id"])
    await _get_owned_hospital(hospital_id, user_id)

    folders = (
        await report_folders_col.find(
            {"hospital_id": hospital_id, "user_id": user_id}
        )
        .sort("created_at", -1)
        .to_list(None)
    )
    return [await _build_rf_response(f) for f in folders]


@router.delete(
    "/hospitals/{hospital_id}/reports/folders/{rf_id}",
    status_code=200,
)
async def delete_report_folder(
    hospital_id: str,
    rf_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a sub-folder and all documents inside it."""
    user_id = str(current_user["_id"])
    await _get_owned_rf(rf_id, user_id)

    docs = await documents_col.find({"report_folder_id": rf_id}).to_list(None)
    for doc in docs:
        try:
            await delete_file_from_gridfs(str(doc["file_id"]))
        except Exception:
            pass
    await documents_col.delete_many({"report_folder_id": rf_id})
    await report_folders_col.delete_one({"_id": _parse_oid(rf_id)})

    return {"message": f"Report folder '{rf_id}' and all its documents deleted."}


# ── Document upload + listing inside a sub-folder ─────────────────────────────

@router.post(
    "/hospitals/{hospital_id}/reports/folders/{rf_id}/upload",
    response_model=DocumentResponse,
    status_code=201,
)
async def upload_to_report_folder(
    hospital_id: str,
    rf_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    file: UploadFile = File(...),
):
    """
    Upload a file into a specific report sub-folder.
    The sub-folder name is stored as report_type — the OCR system will use it
    directly instead of trying to detect the report category.
    """
    user_id = str(current_user["_id"])
    hospital = await _get_owned_hospital(hospital_id, user_id)
    rf = await _get_owned_rf(rf_id, user_id)

    mime_type = file.content_type or ""
    if mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{mime_type}'. Allowed: {list(ALLOWED_MIME_TYPES)}.",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum is {MAX_FILE_SIZE // (1024*1024)} MB.",
        )

    original_filename = file.filename or f"upload{ALLOWED_MIME_TYPES[mime_type]}"
    stored_filename = await generate_unique_stored_filename(
        original_filename, hospital_id, "reports"
    )

    file_id = await save_file_to_gridfs(
        content=content,
        stored_filename=stored_filename,
        mime_type=mime_type,
        hospital_id=hospital_id,
        folder="reports",
    )

    doc_record = {
        "user_id": user_id,
        "hospital_id": hospital_id,
        "hospital_name": hospital["name"],
        "folder": "reports",
        "report_folder_id": rf_id,
        "report_folder_name": rf["name"],   # ← becomes OCR report_type
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
    "/hospitals/{hospital_id}/reports/folders/{rf_id}/documents",
    response_model=list[DocumentListItem],
)
async def list_report_folder_documents(
    hospital_id: str,
    rf_id: str,
    current_user: dict = Depends(get_current_user),
    skip: int = 0,
    limit: int = 50,
):
    """List documents inside a specific report sub-folder, newest first."""
    user_id = str(current_user["_id"])
    await _get_owned_rf(rf_id, user_id)

    docs = (
        await documents_col.find(
            {"report_folder_id": rf_id, "user_id": user_id}
        )
        .sort("upload_date", -1)
        .skip(skip)
        .limit(limit)
        .to_list(None)
    )
    return [_doc_to_list_item(d) for d in docs]
