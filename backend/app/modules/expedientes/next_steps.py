"""Motor de next steps (vista dinamica de acciones).

`recompute(db, case)` deriva los next steps del estado del expediente + checklist
y reconcilia la tabla next_step (resuelve los que ya no aplican, crea los nuevos).

Es propiedad del modulo de expedientes; lo invocan Documentos, Webhooks y Crons.
Las reglas de "proximo a vencer" / "vencido" / "inactividad" las disparan los crons,
que llaman a `add_step` directamente y luego pasan por aqui para limpiar.
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.codes import (
    CaseStatus,
    ChecklistStatus,
    DocStatus,
    Priority,
    NextStepStatus,
)
from app.models import CaseChecklistItem, CaseEvent, CaseFile, Document, NextStep

_INACTIVIDAD_DIAS = 3

DOC_LABEL = {
    "OFFICIAL_ID": "INE",
    "CURP": "CURP",
    "TAX_STATUS_CERT": "CSF",
    "PROOF_OF_ADDRESS": "comprobante de domicilio",
}

# Orden de prioridad para elegir el "next step prioritario"
PRIORITY_ORDER = {Priority.HIGH: 0, Priority.MEDIUM: 1, Priority.LOW: 2}


def _checklist(db: Session, case_id) -> list[CaseChecklistItem]:
    return list(
        db.execute(
            select(CaseChecklistItem).where(
                CaseChecklistItem.case_file_id == case_id,
                CaseChecklistItem.active_flag == 1,
            )
        ).scalars()
    )


def _desired_steps(db: Session, case: CaseFile) -> list[tuple[str, str]]:
    """Devuelve [(descripcion, priority_code)] que el expediente deberia tener."""
    if case.status_code in (CaseStatus.CANCELLED, CaseStatus.ARCHIVED):
        return []

    items = _checklist(db, case.id)
    desired: list[tuple[str, str]] = []

    for it in items:
        label = DOC_LABEL.get(it.document_type_code, it.document_type_code)
        if it.status_code == ChecklistStatus.PENDING:
            desired.append((f"Falta {label}", Priority.HIGH))
        elif it.status_code == ChecklistStatus.REJECTED:
            desired.append((f"{label} rechazado, solicitar nuevo", Priority.HIGH))
        elif it.status_code == ChecklistStatus.EXPIRED:
            desired.append((f"{label} vencido, solicitar renovado", Priority.HIGH))

    # Proximo a vencer (7 dias) sobre documentos vigentes del checklist
    soon = dt.date.today() + dt.timedelta(days=7)
    for it in items:
        if it.current_document_id and it.status_code in (
            ChecklistStatus.RECEIVED,
            ChecklistStatus.VALIDATED,
        ):
            doc = db.get(Document, it.current_document_id)
            if doc and doc.expiry_date and dt.date.today() <= doc.expiry_date <= soon:
                label = DOC_LABEL.get(it.document_type_code, it.document_type_code)
                desired.append((f"{label} proximo a vencer", Priority.MEDIUM))

    present = {ChecklistStatus.RECEIVED, ChecklistStatus.VALIDATED}
    all_present = bool(items) and all(it.status_code in present for it in items)
    if case.status_code == CaseStatus.COMPLETE:
        desired.append(("Validado, sin acciones pendientes", Priority.LOW))
    elif all_present:
        desired.append(("Listo para validacion final", Priority.MEDIUM))

    # Inactividad: sin actividad por mas de 3 dias en captura/recepcion
    if case.status_code in (CaseStatus.CAPTURING, CaseStatus.RECEIVING):
        last = db.execute(
            select(CaseEvent.event_at)
            .where(CaseEvent.case_file_id == case.id, CaseEvent.active_flag == 1)
            .order_by(CaseEvent.event_at.desc())
            .limit(1)
        ).scalar()
        ref = last or case.created_at
        if ref is not None:
            age = dt.datetime.now(dt.timezone.utc) - ref
            if age > dt.timedelta(days=_INACTIVIDAD_DIAS):
                desired.append(
                    ("Cliente sin respuesta, enviar recordatorio", Priority.HIGH)
                )

    return desired


def recompute(db: Session, case: CaseFile) -> None:
    """Reconcilia next_step: resuelve los obsoletos, crea los faltantes."""
    desired = _desired_steps(db, case)
    desired_descs = {d for d, _ in desired}

    existing = list(
        db.execute(
            select(NextStep).where(
                NextStep.case_file_id == case.id,
                NextStep.active_flag == 1,
                NextStep.status_code == NextStepStatus.PENDING,
            )
        ).scalars()
    )
    existing_by_desc = {s.description: s for s in existing}

    # Resolver los que ya no aplican
    for s in existing:
        if s.description not in desired_descs:
            s.status_code = NextStepStatus.RESOLVED
            s.resolved_at = dt.datetime.now(dt.timezone.utc)

    # Crear los nuevos
    for desc, prio in desired:
        if desc not in existing_by_desc:
            db.add(
                NextStep(
                    case_file_id=case.id,
                    description=desc,
                    priority_code=prio,
                    status_code=NextStepStatus.PENDING,
                )
            )
    db.flush()


def pending_steps(db: Session, case_id) -> list[NextStep]:
    steps = list(
        db.execute(
            select(NextStep).where(
                NextStep.case_file_id == case_id,
                NextStep.active_flag == 1,
                NextStep.status_code == NextStepStatus.PENDING,
            )
        ).scalars()
    )
    steps.sort(key=lambda s: (PRIORITY_ORDER.get(s.priority_code, 9), s.created_at))
    return steps


def prioritario(db: Session, case_id) -> str:
    steps = pending_steps(db, case_id)
    return steps[0].description if steps else "Sin acciones pendientes"
