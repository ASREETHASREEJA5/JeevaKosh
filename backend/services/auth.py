"""
JWT authentication service.

Provides:
  - hash_password / verify_password (bcrypt)
  - create_token (HS256 JWT, 7-day expiry)
  - get_current_user FastAPI dependency (validates Bearer token → returns user dict)
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from bson import ObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from backend.database import users_col

SECRET_KEY: str = os.getenv("JWT_SECRET", "CHANGE_ME_before_production")
ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 7

_bearer = HTTPBearer()


# ── Password helpers ──────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── Token helpers ─────────────────────────────────────────────────────────────

def create_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS)
    payload: dict[str, Any] = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ── FastAPI dependencies ──────────────────────────────────────────────────────

async def _resolve_token(token: str) -> dict:
    """Decode a raw JWT string and return the user document."""
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token. Please log in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload: dict[str, Any] = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise exc
    except JWTError:
        raise exc

    user = await users_col.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise exc
    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """Standard Bearer-token dependency for all API routes."""
    return await _resolve_token(credentials.credentials)


_bearer_optional = HTTPBearer(auto_error=False)


async def get_current_user_preview(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_optional),
    token: str | None = None,   # injected as query param by FastAPI when declared in path
) -> dict:
    """
    Flexible dependency for the file-preview endpoint.
    Accepts the token from the Authorization header OR from a ?token= query param
    so that <img> / <iframe> browser elements (which can't set headers) work too.
    """
    raw = (credentials.credentials if credentials else None) or token
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    return await _resolve_token(raw)
