"""Crea (o actualiza) el usuario admin del MVP. Uso: python -m app.seed"""
from __future__ import annotations

from sqlalchemy import select

from app.core.config import settings
from app.core.db import db_session
from app.core.security import hash_password
from app.models import AppUser


def seed_admin() -> None:
    with db_session(user_label="seed") as db:
        existing = db.execute(
            select(AppUser).where(AppUser.email == settings.admin_email.lower())
        ).scalar_one_or_none()
        if existing:
            existing.password_hash = hash_password(settings.admin_password)
            existing.full_name = settings.admin_name
            existing.active_flag = 1
            print(f"Admin actualizado: {settings.admin_email}")
        else:
            db.add(
                AppUser(
                    email=settings.admin_email.lower(),
                    password_hash=hash_password(settings.admin_password),
                    full_name=settings.admin_name,
                    role_code="INTERNAL",
                )
            )
            print(f"Admin creado: {settings.admin_email}")


if __name__ == "__main__":
    seed_admin()
