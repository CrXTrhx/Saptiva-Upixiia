"""Dependencies de FastAPI: sesion de BD + usuario autenticado."""
from __future__ import annotations

from typing import Iterator

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal, set_audit_user
from app.core.errors import UnauthorizedError
from app.core.security import decode_access_token
from app.models import AppUser


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        set_audit_user(db, None, "system")
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> AppUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise UnauthorizedError("No autenticado")
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise UnauthorizedError("Token invalido o expirado")

    user = db.execute(
        select(AppUser).where(
            AppUser.id == payload["sub"], AppUser.active_flag == 1
        )
    ).scalar_one_or_none()
    if user is None:
        raise UnauthorizedError("Usuario no encontrado")

    # Inyecta el actor real en la transaccion para la bitacora de auditoria.
    set_audit_user(db, str(user.id), user.email)
    return user
