"""Timeline de negocio (case_event). Lo escribe la app (distinto de audit_log)."""
from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models import CaseEvent


def registrar_evento(
    db: Session,
    case_file_id: uuid.UUID,
    event_type_code: str,
    descripcion: str,
    actor: str = "system",
    actor_user_id: uuid.UUID | None = None,
    metadata: dict | None = None,
) -> CaseEvent:
    ev = CaseEvent(
        case_file_id=case_file_id,
        event_type_code=event_type_code,
        description=descripcion,
        actor=actor,
        actor_user_id=actor_user_id,
        event_metadata=metadata,
    )
    db.add(ev)
    db.flush()
    return ev
