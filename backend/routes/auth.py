"""
Auth routes.

POST /auth/register  → create account, returns JWT
POST /auth/login     → sign in, returns JWT
GET  /auth/me        → return current user (requires valid token)
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from backend.database import users_col
from backend.models.user import TokenResponse, UserLogin, UserOut, UserRegister
from backend.services.auth import (
    create_token,
    get_current_user,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(data: UserRegister):
    """Create a new user account and return a JWT."""
    if await users_col.find_one({"email": data.email.lower()}):
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists.",
        )

    doc = {
        "name": data.name.strip(),
        "email": data.email.lower(),
        "password_hash": hash_password(data.password),
        "created_at": datetime.now(timezone.utc),
    }
    result = await users_col.insert_one(doc)
    user_id = str(result.inserted_id)

    return TokenResponse(
        access_token=create_token(user_id),
        user=UserOut(id=user_id, name=doc["name"], email=doc["email"]),
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin):
    """Sign in with email + password and return a JWT."""
    user = await users_col.find_one({"email": data.email.lower()})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    user_id = str(user["_id"])
    return TokenResponse(
        access_token=create_token(user_id),
        user=UserOut(id=user_id, name=user["name"], email=user["email"]),
    )


@router.get("/me", response_model=UserOut)
async def me(current_user: dict = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return UserOut(
        id=str(current_user["_id"]),
        name=current_user["name"],
        email=current_user["email"],
    )
