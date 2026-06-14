"""
Patient portfolio profile — one document per user.

GET  /profile  → fetch the authenticated user's medical portfolio
PUT  /profile  → create or update the portfolio
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from backend.database import profiles_col
from backend.models.profile import ProfileResponse, ProfileUpdate
from backend.services.auth import get_current_user

router = APIRouter(prefix="/profile", tags=["Profile"])


def _empty_profile() -> dict:
    return ProfileUpdate().model_dump()


def _to_response(doc: dict) -> ProfileResponse:
    payload = {k: doc.get(k) for k in ProfileUpdate.model_fields}
    for key, default in ProfileUpdate.model_fields.items():
        if payload.get(key) is None:
            payload[key] = ProfileUpdate().model_dump()[key]
    return ProfileResponse(
        **payload,
        updated_at=doc.get("updated_at"),
    )


@router.get("/", response_model=ProfileResponse)
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Return the user's patient portfolio, or an empty template if none exists yet."""
    user_id = str(current_user["_id"])
    doc = await profiles_col.find_one({"user_id": user_id})
    if not doc:
        return ProfileResponse(**_empty_profile(), updated_at=None)
    return _to_response(doc)


@router.put("/", response_model=ProfileResponse)
async def upsert_profile(
    body: ProfileUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Create or replace the user's patient portfolio."""
    user_id = str(current_user["_id"])
    now = datetime.now(timezone.utc)
    payload = body.model_dump()
    payload["user_id"] = user_id
    payload["updated_at"] = now

    await profiles_col.update_one(
        {"user_id": user_id},
        {"$set": payload},
        upsert=True,
    )

    doc = await profiles_col.find_one({"user_id": user_id})
    return _to_response(doc)
