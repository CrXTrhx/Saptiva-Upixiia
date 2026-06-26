"""Crons diarios (PRD seccion 6). Cada job abre su propia transaccion auditada.

Uso (Railway cron / Task Scheduler):
    python -m app.crons.jobs vencimiento_proximo
    python -m app.crons.jobs vencimiento_consumado
    python -m app.crons.jobs inactividad
    python -m app.crons.jobs all
"""
from __future__ import annotations

import datetime as dt
import sys

from sqlalchemy import select

from app.core.codes import (
    CaseStatus,
    ChecklistStatus,
    DocStatus,
    EventType,
    OPEN_STATUSES,
)
from app.core.db import db_session
from app.integrations import sinch
from app.models import CaseChecklistItem, CaseFile, Document
from app.modules.eventos import registrar_evento
from app.modules.expedientes import next_steps as ns
from app.modules.expedientes.state_machine import transition

_INACTIVIDAD = dt.timedelta(days=3)


def _active_cases(db) -> list[CaseFile]:
    return list(
        db.execute(
            select(CaseFile).where(
                CaseFile.active_flag == 1,
                CaseFile.status_code.in_(OPEN_STATUSES),
            )
        ).scalars()
    )


def vencimiento_proximo() -> int:
    """Recalcula next steps (genera 'proximo a vencer') para expedientes activos."""
    count = 0
    with db_session(user_label="cron") as db:
        for case in _active_cases(db):
            ns.recompute(db, case)
            count += 1
    print(f"[cron] vencimiento_proximo: {count} expedientes revisados")
    return count


def vencimiento_consumado() -> int:
    """Marca documentos vencidos y baja el expediente a incompleto_vencido."""
    today = dt.date.today()
    afectados = 0
    with db_session(user_label="cron") as db:
        docs = list(
            db.execute(
                select(Document).where(
                    Document.active_flag == 1,
                    Document.status_code.in_([DocStatus.RECEIVED, DocStatus.VALIDATED]),
                    Document.expiry_date.is_not(None),
                    Document.expiry_date < today,
                )
            ).scalars()
        )
        for doc in docs:
            doc.status_code = DocStatus.EXPIRED
            db.flush()
            item = db.execute(
                select(CaseChecklistItem).where(
                    CaseChecklistItem.case_file_id == doc.case_file_id,
                    CaseChecklistItem.current_document_id == doc.id,
                    CaseChecklistItem.active_flag == 1,
                )
            ).scalar_one_or_none()
            if item:
                item.status_code = ChecklistStatus.EXPIRED
                item.current_document_id = None
                db.flush()
            case = db.get(CaseFile, doc.case_file_id)
            if case.status_code in OPEN_STATUSES and case.status_code not in (
                CaseStatus.INCOMPLETE_EXPIRED,
                CaseStatus.COMPLETE,
            ):
                transition(
                    db, case, CaseStatus.INCOMPLETE_EXPIRED, actor="cron",
                    descripcion="Documento vencido",
                )
            elif case.status_code == CaseStatus.COMPLETE:
                transition(
                    db, case, CaseStatus.INCOMPLETE_EXPIRED, actor="cron",
                    descripcion="Documento ya validado vencio",
                )
            registrar_evento(
                db, case.id, EventType.STATUS_CHANGED,
                "Documento vencido, solicitar renovado", actor="cron",
            )
            ns.recompute(db, case)
            afectados += 1
    print(f"[cron] vencimiento_consumado: {afectados} documentos vencidos")
    return afectados


def inactividad() -> int:
    """Genera recordatorio para expedientes en recepcion sin actividad > 3 dias."""
    now = dt.datetime.now(dt.timezone.utc)
    notificados = 0
    with db_session(user_label="cron") as db:
        cases = list(
            db.execute(
                select(CaseFile).where(
                    CaseFile.active_flag == 1,
                    CaseFile.status_code == CaseStatus.RECEIVING,
                )
            ).scalars()
        )
        for case in cases:
            last_doc = db.execute(
                select(Document.reception_at)
                .where(Document.case_file_id == case.id, Document.active_flag == 1)
                .order_by(Document.reception_at.desc())
                .limit(1)
            ).scalar()
            ref = last_doc or case.created_at
            if ref and (now - ref) > _INACTIVIDAD:
                ns.recompute(db, case)
                registrar_evento(
                    db, case.id, EventType.REMINDER_SENT,
                    "Recordatorio de inactividad enviado al cliente", actor="cron",
                )
                if case.client_phone:
                    sinch.send_message(
                        case.client_phone,
                        f"Hola, seguimos esperando tus documentos para {case.code}.",
                    )
                notificados += 1
    print(f"[cron] inactividad: {notificados} recordatorios")
    return notificados


_JOBS = {
    "vencimiento_proximo": vencimiento_proximo,
    "vencimiento_consumado": vencimiento_consumado,
    "inactividad": inactividad,
}


def main(argv: list[str]) -> int:
    job = argv[1] if len(argv) > 1 else "all"
    if job == "all":
        for fn in _JOBS.values():
            fn()
    elif job in _JOBS:
        _JOBS[job]()
    else:
        print(f"Job desconocido: {job}. Opciones: {', '.join(_JOBS)}, all")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
