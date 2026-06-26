"""Auth: login (JWT) y perfil del usuario actual."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.core.errors import UnauthorizedError
from app.core.security import create_access_token, verify_password
from app.models import AppUser
from app.schemas.base import CamelModel


class LoginRequest(CamelModel):
    email: EmailStr
    password: str


router = APIRouter(tags=["auth"])


def _user_dict(user: AppUser) -> dict:
    return {"id": str(user.id), "email": user.email, "nombre": user.full_name}


@router.post("/auth/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.execute(
        select(AppUser).where(
            AppUser.email == str(body.email).lower(), AppUser.active_flag == 1
        )
    ).scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise UnauthorizedError("Credenciales invalidas")
    token = create_access_token(str(user.id), {"email": user.email})
    return {"success": True, "user": _user_dict(user), "token": token}


@router.get("/auth/me")
def me(user: AppUser = Depends(get_current_user)):
    return {**_user_dict(user), "rol": user.role_code}
