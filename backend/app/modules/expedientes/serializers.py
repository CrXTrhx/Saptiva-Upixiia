"""Serializadores: ORM -> dicts camelCase con codigos en ingles (contrato frontend)."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.codes import (
    EVENT_TONE,
    ChecklistStatus,
    DocStatus,
)
from app.integrations import storage
from app.models import (
    AppUser,
    CaseChecklistItem,
    CaseEvent,
    CaseFile,
    Document,
    InternalNote,
)
from app.modules.expedientes import next_steps as ns
from app.schemas.base import iso

_MISSING_CHECKLIST = {
    ChecklistStatus.PENDING,
    ChecklistStatus.REJECTED,
    ChecklistStatus.EXPIRED,
}


def _capturista_nombre(db: Session, case: CaseFile) -> str:
    if not case.assigned_user_id:
        return "Sin asignar"
    user = db.get(AppUser, case.assigned_user_id)
    return user.full_name if user else "Sin asignar"


def _ultima_actividad(db: Session, case: CaseFile):
    last = db.execute(
        select(CaseEvent.event_at)
        .where(CaseEvent.case_file_id == case.id, CaseEvent.active_flag == 1)
        .order_by(CaseEvent.event_at.desc())
        .limit(1)
    ).scalar()
    return last or case.updated_at or case.created_at


def documentos_faltantes(db: Session, case_id) -> list[str]:
    items = db.execute(
        select(CaseChecklistItem).where(
            CaseChecklistItem.case_file_id == case_id,
            CaseChecklistItem.active_flag == 1,
        )
    ).scalars()
    return [i.document_type_code for i in items if i.status_code in _MISSING_CHECKLIST]


def serialize_expediente(db: Session, case: CaseFile) -> dict:
    """Item de lista (tipo Expediente del frontend)."""
    return {
        "id": str(case.id),
        "codigo": case.code,
        "clienteNombre": case.client_name,
        "clienteRfc": case.client_rfc,
        "clienteTelefono": case.client_phone or "",
        "clienteCorreo": case.client_email or "",
        "fechaCreacion": iso(case.created_at),
        "estado": case.status_code,
        "montoEstimado": float(case.estimated_amount),
        "tipoOperacion": case.operation_type_code,
        "nextStepPrioritario": ns.prioritario(db, case.id),
        "capturista": _capturista_nombre(db, case),
        "documentosFaltantes": documentos_faltantes(db, case.id),
        "ultimaActividad": iso(_ultima_actividad(db, case)),
    }


def serialize_documento(db: Session, doc: Document, with_version: bool = True) -> dict:
    motivo = None
    if doc.rejection_reason_code:
        motivo = {
            "categoria": doc.rejection_reason_code,
            "texto": doc.rejection_note or "",
        }
    version_anterior = None
    if with_version:
        # La version anterior es el documento que fue reemplazado por este.
        # Tras una restauracion puede existir mas de un candidato (cadena de
        # reemplazos): tomamos el mas reciente para mostrar SOLO un nivel atras.
        prev = db.execute(
            select(Document)
            .where(Document.replaced_by_id == doc.id)
            .order_by(Document.reception_at.desc())
        ).scalars().first()
        if prev:
            version_anterior = serialize_documento(db, prev, with_version=False)

    return {
        "id": str(doc.id),
        "tipo": doc.declared_type_code or doc.detected_type_code or "OTHER",
        "estado": doc.status_code,
        "filename": doc.file_name or "documento",
        "archivoUrl": storage.resolve_url(doc.file_url),
        "mimeType": doc.mime_type or "application/octet-stream",
        "canal": doc.channel_code,
        "remitente": doc.sender or "",
        "fechaRecepcion": iso(doc.reception_at),
        "datosExtraidos": doc.extracted_data or None,
        "motivoRechazo": motivo,
        "rechazoAutomatico": bool(doc.is_auto_rejected),
        "versionAnterior": version_anterior,
    }


def serialize_checklist_item(item: CaseChecklistItem) -> dict:
    return {
        "tipo": item.document_type_code,
        "estado": item.status_code,
        "documentoId": str(item.current_document_id) if item.current_document_id else None,
    }


def serialize_next_step(step) -> dict:
    return {
        "id": str(step.id),
        "texto": step.description,
        "prioridad": step.priority_code,
    }


def serialize_evento(ev: CaseEvent) -> dict:
    return {
        "id": str(ev.id),
        "tipo": ev.event_type_code,
        "descripcion": ev.description or "",
        "timestamp": iso(ev.event_at),
        "tono": EVENT_TONE.get(ev.event_type_code, "neutral"),
    }


def serialize_nota(db: Session, nota: InternalNote) -> dict:
    autor = db.get(AppUser, nota.author_id)
    return {
        "id": str(nota.id),
        "texto": nota.body,
        "autor": autor.full_name if autor else "Interno",
        "timestamp": iso(nota.created_at),
    }


def serialize_detalle(db: Session, case: CaseFile) -> dict:
    base = serialize_expediente(db, case)
    base["montoEstimado"] = float(case.estimated_amount)
    base["tipoOperacion"] = case.operation_type_code

    checklist = list(
        db.execute(
            select(CaseChecklistItem)
            .where(
                CaseChecklistItem.case_file_id == case.id,
                CaseChecklistItem.active_flag == 1,
            )
            .order_by(CaseChecklistItem.created_at)
        ).scalars()
    )

    docs = list(
        db.execute(
            select(Document)
            .where(
                Document.case_file_id == case.id,
                Document.active_flag == 1,
                Document.status_code != DocStatus.REPLACED,  # reemplazados van anidados
            )
            .order_by(Document.reception_at.desc())
        ).scalars()
    )

    eventos = list(
        db.execute(
            select(CaseEvent)
            .where(CaseEvent.case_file_id == case.id, CaseEvent.active_flag == 1)
            .order_by(CaseEvent.event_at.desc())
        ).scalars()
    )

    notas = list(
        db.execute(
            select(InternalNote)
            .where(
                InternalNote.case_file_id == case.id, InternalNote.active_flag == 1
            )
            .order_by(InternalNote.created_at.desc())
        ).scalars()
    )

    return {
        "expediente": base,
        "checklist": [serialize_checklist_item(i) for i in checklist],
        "documentos": [serialize_documento(db, d) for d in docs],
        "nextSteps": [serialize_next_step(s) for s in ns.pending_steps(db, case.id)],
        "historial": [serialize_evento(e) for e in eventos],
        "notas": [serialize_nota(db, n) for n in notas],
    }
