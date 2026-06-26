"""Conexion a la BD (Neon) + inyeccion de usuario para la bitacora de auditoria.

Reglas del handoff de BD:
  * Conexion DIRECTA (sin -pooler), driver psycopg3 sincrono.
  * Cada escritura debe inyectar el usuario actual para que los triggers fn_audit
    registren el autor:  SET LOCAL app.current_user_id / app.current_user_label.
  * Nunca DELETE fisico; las lecturas filtran active_flag = 1 (responsabilidad de
    cada repositorio).
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.sqlalchemy_url,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def set_audit_user(db: Session, user_id: str | None, user_label: str | None) -> None:
    """Inyecta el actor en la transaccion actual (local a la transaccion).

    Usa set_config(..., is_local=true) para que los triggers de auditoria sepan
    quien hizo el cambio. Debe llamarse dentro de la transaccion que hara los
    escrituras (antes del commit).
    """
    db.execute(
        text("SELECT set_config('app.current_user_id', :uid, true)"),
        {"uid": str(user_id) if user_id else ""},
    )
    db.execute(
        text("SELECT set_config('app.current_user_label', :lbl, true)"),
        {"lbl": user_label or "system"},
    )


@contextmanager
def db_session(
    user_id: str | None = None, user_label: str | None = None
) -> Iterator[Session]:
    """Context manager transaccional con inyeccion de auditoria.

    Uso:
        with db_session(user_id=str(user.id), user_label=user.email) as db:
            db.add(obj)
        # commit automatico al salir sin excepcion; rollback si hay error.
    """
    db = SessionLocal()
    try:
        set_audit_user(db, user_id, user_label)
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_db() -> Iterator[Session]:
    """Dependency de FastAPI. La sesion se commitea al final del request.

    El actor de auditoria lo fija `get_current_user` (en deps.py) sobre esta
    misma sesion; para endpoints sin auth queda como 'system'.
    """
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


def ping() -> bool:
    """Sanity check de conectividad."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
