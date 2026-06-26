"""Maquina de estados del expediente.

Valida transiciones contra cat_case_status_transition y registra el evento
STATUS_CHANGED. Es el unico punto que muta case_file.status_code.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.codes import EventType
from app.core.errors import ConflictError
from app.models import CaseFile, CatCaseStatusTransition
from app.modules.eventos import registrar_evento


def _is_valid(db: Session, from_code: str, to_code: str) -> bool:
    if from_code == to_code:
        return True
    row = db.execute(
        select(CatCaseStatusTransition).where(
            CatCaseStatusTransition.from_code == from_code,
            CatCaseStatusTransition.to_code == to_code,
        )
    ).first()
    return row is not None


def transition(
    db: Session,
    case: CaseFile,
    to_status: str,
    *,
    actor: str = "system",
    actor_user_id: uuid.UUID | None = None,
    descripcion: str | None = None,
    force: bool = False,
) -> None:
    """Cambia el estado del expediente si la transicion es valida."""
    from_status = case.status_code
    if from_status == to_status:
        return
    if not force and not _is_valid(db, from_status, to_status):
        raise ConflictError(
            f"Transicion de estado invalida: {from_status} -> {to_status}"
        )
    case.status_code = to_status
    db.flush()
    registrar_evento(
        db,
        case.id,
        EventType.STATUS_CHANGED,
        descripcion or f"Estado: {from_status} -> {to_status}",
        actor=actor,
        actor_user_id=actor_user_id,
        metadata={"from": from_status, "to": to_status},
    )
