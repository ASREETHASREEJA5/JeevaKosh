"""
Hospital routes — all scoped to the authenticated user.

POST   /hospitals                → create hospital (auto-provisions prescriptions & reports)
GET    /hospitals                → list MY hospitals
GET    /hospitals/{hospital_id}  → get MY hospital
DELETE /hospitals/{hospital_id}  → delete MY hospital (cascades documents + GridFS files)
"""

import re
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException

from backend.database import documents_col, hospitals_col
from backend.models.hospital import HospitalCreate, HospitalResponse
from backend.services.auth import get_current_user
from backend.services.storage import delete_file_from_gridfs

router = APIRouter(prefix="/hospitals", tags=["Hospitals"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _parse_oid(raw: str) -> ObjectId:
    try:
        return ObjectId(raw)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail=f"Invalid id: {raw}")


async def _build_response(hospital: dict) -> HospitalResponse:
    hosp_id = str(hospital["_id"])
    total_prescriptions = await documents_col.count_documents(
        {"hospital_id": hosp_id, "folder": "prescriptions"}
    )
    total_reports = await documents_col.count_documents(
        {"hospital_id": hosp_id, "folder": "reports"}
    )
    return HospitalResponse(
        id=hosp_id,
        name=hospital["name"],
        slug=hospital["slug"],
        created_at=hospital["created_at"],
        total_prescriptions=total_prescriptions,
        total_reports=total_reports,
    )


async def _get_owned_hospital(hospital_id: str, user_id: str) -> dict:
    """Return hospital only if it belongs to the current user."""
    hospital = await hospitals_col.find_one(
        {"_id": _parse_oid(hospital_id), "user_id": user_id}
    )
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found.")
    return hospital


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/", response_model=HospitalResponse, status_code=201)
async def create_hospital(
    data: HospitalCreate,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])
    slug = _slugify(data.name)

    if await hospitals_col.find_one({"user_id": user_id, "slug": slug}):
        raise HTTPException(
            status_code=409,
            detail=f"You already have a hospital named '{data.name}'.",
        )

    doc = {
        "user_id": user_id,
        "name": data.name.strip(),
        "slug": slug,
        "created_at": datetime.now(timezone.utc),
    }
    result = await hospitals_col.insert_one(doc)
    doc["_id"] = result.inserted_id
    return await _build_response(doc)


@router.get("/", response_model=list[HospitalResponse])
async def list_hospitals(current_user: dict = Depends(get_current_user)):
    """Return only the hospitals that belong to the current user."""
    user_id = str(current_user["_id"])
    hospitals = (
        await hospitals_col.find({"user_id": user_id})
        .sort("created_at", -1)
        .to_list(None)
    )
    return [await _build_response(h) for h in hospitals]


@router.get("/{hospital_id}", response_model=HospitalResponse)
async def get_hospital(
    hospital_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["_id"])
    hospital = await _get_owned_hospital(hospital_id, user_id)
    return await _build_response(hospital)


@router.delete("/{hospital_id}", status_code=200)
async def delete_hospital(
    hospital_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a hospital and all its documents (only if you own it)."""
    user_id = str(current_user["_id"])
    await _get_owned_hospital(hospital_id, user_id)  # ownership check

    docs = await documents_col.find({"hospital_id": hospital_id}).to_list(None)
    for doc in docs:
        try:
            await delete_file_from_gridfs(str(doc["file_id"]))
        except Exception:
            pass

    await documents_col.delete_many({"hospital_id": hospital_id})
    await hospitals_col.delete_one({"_id": _parse_oid(hospital_id)})

    return {"message": f"Hospital '{hospital_id}' and all its records deleted."}
