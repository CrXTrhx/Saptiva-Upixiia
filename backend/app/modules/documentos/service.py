"""Logica de documentos: ingesta (pipeline), validacion/rechazo manual, reemplazo."""
from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.codes import (
    CaseStatus,
    Channel,
    ChecklistStatus,
    DocStatus,
    DocType,
    EventType,
)
from app.core.codes import RejectionReason
from app.core.db import db_session
from app.core.errors import ConflictError, NotFoundError
from app.integrations import storage
from app.models import AppUser, CaseChecklistItem, CaseFile, Document
from app.modules.eventos import registrar_evento
from app.modules.expedientes import next_steps as ns
from app.modules.expedientes.state_machine import transition
from app.modules.pipeline.context import PipelineContext
from app.modules.pipeline.runner import run as run_pipeline


def get_doc_or_404(db: Session, doc_id: str) -> Document:
    try:
        uid = uuid.UUID(str(doc_id))
    except (ValueError, TypeError):
        raise NotFoundError("Documento no encontrado")
    doc = db.execute(
        select(Document).where(Document.id == uid, Document.active_flag == 1)
    ).scalar_one_or_none()
    if doc is None:
        raise NotFoundError("Documento no encontrado")
    return doc


def _checklist_item(db: Session, case_id, doc_type: str | None) -> CaseChecklistItem | None:
    if not doc_type or doc_type == DocType.OTHER:
        return None
    return db.execute(
        select(CaseChecklistItem).where(
            CaseChecklistItem.case_file_id == case_id,
            CaseChecklistItem.document_type_code == doc_type,
            CaseChecklistItem.active_flag == 1,
        )
    ).scalar_one_or_none()


def ingest_document(
    db: Session,
    case: CaseFile,
    *,
    content: bytes,
    file_name: str,
    mime_type: str | None,
    channel: str,
    sender: str | None,
    declared_type: str | None,
    actor: str = "system",
    actor_user_id: uuid.UUID | None = None,
) -> Document:
    """Almacena el archivo, crea el Documento y corre el pipeline."""
    stored = storage.store(content, file_name, mime_type)
    doc = Document(
        case_file_id=case.id,
        declared_type_code=declared_type,
        file_url=stored.url,
        file_name=stored.file_name,
        mime_type=stored.mime_type,
        channel_code=channel,
        sender=sender,
        status_code=DocStatus.RECEIVED,
    )
    db.add(doc)
    db.flush()

    ctx = PipelineContext(
        db=db,
        document=doc,
        case=case,
        declared_type=declared_type,
        file_name=stored.file_name,
        mime_type=stored.mime_type,
        content=content,
        actor=actor,
        actor_user_id=actor_user_id,
    )
    run_pipeline(ctx)
    return doc


def create_processing_document(
    db: Session,
    case: CaseFile,
    *,
    content: bytes,
    file_name: str,
    mime_type: str | None,
    channel: str,
    sender: str | None,
    declared_type: str | None,
) -> Document:
    """Almacena el archivo y crea el Documento en estado PROCESSING (sin pipeline).

    El analisis (Document AI) lo corre `process_document` en segundo plano. Guardar
    el documento de inmediato lo hace visible aunque el usuario recargue la pagina.
    """
    stored = storage.store(content, file_name, mime_type)
    doc = Document(
        case_file_id=case.id,
        declared_type_code=declared_type,
        file_url=stored.url,
        file_name=stored.file_name,
        mime_type=stored.mime_type,
        channel_code=channel,
        sender=sender,
        status_code=DocStatus.PROCESSING,
    )
    db.add(doc)
    db.flush()
    return doc


def process_document(
    doc_id: str,
    *,
    actor: str = "system",
    actor_user_id: uuid.UUID | None = None,
) -> None:
    """Corre el pipeline de extraccion/validacion sobre un documento PROCESSING.

    Se ejecuta en segundo plano (BackgroundTask), por lo que abre su PROPIA sesion.
    Si algo inesperado falla, marca el documento como rechazado para no dejarlo
    colgado en PROCESSING.
    """
    uid_actor = str(actor_user_id) if actor_user_id else None
    try:
        with db_session(user_id=uid_actor, user_label=actor) as db:
            doc = db.get(Document, uuid.UUID(str(doc_id)))
            if doc is None or doc.status_code != DocStatus.PROCESSING:
                return
            case = db.get(CaseFile, doc.case_file_id)
            try:
                content = storage.read(doc.file_url)
            except Exception:
                content = None
            ctx = PipelineContext(
                db=db, document=doc, case=case,
                declared_type=doc.declared_type_code,
                file_name=doc.file_name or "documento", mime_type=doc.mime_type,
                content=content, actor=actor, actor_user_id=actor_user_id,
            )
            run_pipeline(ctx)
    except Exception:
        # Red de seguridad: no dejar el documento atascado en PROCESSING.
        with db_session(user_id=uid_actor, user_label=actor) as db:
            doc = db.get(Document, uuid.UUID(str(doc_id)))
            if doc is not None and doc.status_code == DocStatus.PROCESSING:
                doc.status_code = DocStatus.REJECTED
                doc.rejection_reason_code = RejectionReason.OTHER
                doc.rejection_note = "No se pudo procesar el documento"
                doc.is_auto_rejected = 1


def ingest_existing(
    db: Session,
    case: CaseFile,
    *,
    file_url: str,
    file_name: str,
    mime_type: str | None,
    channel: str,
    sender: str | None,
    declared_type: str | None,
    actor: str = "system",
    actor_user_id: uuid.UUID | None = None,
) -> Document:
    """Crea el Documento usando un archivo ya almacenado (ej. desde un huerfano)."""
    doc = Document(
        case_file_id=case.id,
        declared_type_code=declared_type,
        file_url=file_url,
        file_name=file_name,
        mime_type=mime_type,
        channel_code=channel,
        sender=sender,
        status_code=DocStatus.RECEIVED,
    )
    db.add(doc)
    db.flush()

    # El archivo ya esta almacenado; recuperamos los bytes para que el pipeline pueda
    # reclasificar/extraer con Document AI.
    try:
        content = storage.read(file_url)
    except Exception:
        content = None

    ctx = PipelineContext(
        db=db, document=doc, case=case, declared_type=declared_type,
        file_name=file_name, mime_type=mime_type, content=content,
        actor=actor, actor_user_id=actor_user_id,
    )
    run_pipeline(ctx)
    return doc


def validar_documento(db: Session, doc: Document, user: AppUser) -> Document:
    if doc.status_code == DocStatus.VALIDATED:
        return doc
    doc.status_code = DocStatus.VALIDATED
    doc.rejection_reason_code = None
    doc.rejection_note = None
    doc.is_auto_rejected = 0
    doc.validated_by_id = user.id
    doc.validated_at = dt.datetime.now(dt.timezone.utc)
    db.flush()

    doc_type = doc.detected_type_code or doc.declared_type_code
    item = _checklist_item(db, doc.case_file_id, doc_type)
    if item:
        item.status_code = ChecklistStatus.VALIDATED
        item.current_document_id = doc.id
        db.flush()

    case = db.get(CaseFile, doc.case_file_id)
    registrar_evento(
        db, case.id, EventType.DOCUMENT_VALIDATED,
        f"Documento {doc_type or ''} validado por {user.full_name}",
        actor=user.email, actor_user_id=user.id,
    )
    _maybe_to_validation(db, case, user)
    ns.recompute(db, case)
    return doc


def rechazar_documento(
    db: Session, doc: Document, categoria: str, texto: str, user: AppUser
) -> Document:
    doc.status_code = DocStatus.REJECTED
    doc.rejection_reason_code = categoria
    doc.rejection_note = texto
    doc.is_auto_rejected = 0
    db.flush()

    doc_type = doc.detected_type_code or doc.declared_type_code
    item = _checklist_item(db, doc.case_file_id, doc_type)
    if item and item.current_document_id == doc.id:
        item.status_code = ChecklistStatus.REJECTED
        item.current_document_id = None
        db.flush()
    elif item and item.status_code != ChecklistStatus.VALIDATED:
        item.status_code = ChecklistStatus.REJECTED
        db.flush()

    case = db.get(CaseFile, doc.case_file_id)
    registrar_evento(
        db, case.id, EventType.DOCUMENT_REJECTED,
        f"Documento {doc_type or ''} rechazado por {user.full_name}: {texto}",
        actor=user.email, actor_user_id=user.id,
    )
    ns.recompute(db, case)
    return doc


def revertir_rechazo(db: Session, doc: Document, user: AppUser) -> Document:
    """Revierte un rechazo (PRD §5): el documento vuelve a 'recibido'."""
    if doc.status_code != DocStatus.REJECTED:
        raise ConflictError("El documento no esta rechazado")
    doc.status_code = DocStatus.RECEIVED
    doc.rejection_reason_code = None
    doc.rejection_note = None
    doc.is_auto_rejected = 0
    db.flush()

    doc_type = doc.detected_type_code or doc.declared_type_code
    item = _checklist_item(db, doc.case_file_id, doc_type)
    if item and item.status_code != ChecklistStatus.VALIDATED:
        item.status_code = ChecklistStatus.RECEIVED
        item.current_document_id = doc.id
        db.flush()

    case = db.get(CaseFile, doc.case_file_id)
    registrar_evento(
        db, case.id, EventType.AUTO_REJECT_REVERTED,
        f"Rechazo revertido por {user.full_name} para documento {doc_type or ''}",
        actor=user.email, actor_user_id=user.id,
    )
    ns.recompute(db, case)
    return doc


def reemplazar_documento(
    db: Session,
    doc: Document,
    *,
    content: bytes,
    file_name: str,
    mime_type: str | None,
    user: AppUser,
) -> Document:
    case = db.get(CaseFile, doc.case_file_id)
    declared = doc.declared_type_code or doc.detected_type_code

    nuevo = ingest_document(
        db, case,
        content=content, file_name=file_name, mime_type=mime_type,
        channel=Channel.DIRECT_UPLOAD, sender=user.email, declared_type=declared,
        actor=user.email, actor_user_id=user.id,
    )

    doc.status_code = DocStatus.REPLACED
    doc.replaced_by_id = nuevo.id
    db.flush()

    registrar_evento(
        db, case.id, EventType.DOCUMENT_REPLACED,
        f"Documento {declared or ''} reemplazado por una version nueva",
        actor=user.email, actor_user_id=user.id,
    )
    ns.recompute(db, case)
    return nuevo


def _maybe_to_validation(db: Session, case: CaseFile, user: AppUser) -> None:
    """Si todos los items del checklist estan validados y el caso esta en recepcion,
    lo pasa a 'en validacion' (listo para que el usuario marque completo)."""
    items = list(
        db.execute(
            select(CaseChecklistItem).where(
                CaseChecklistItem.case_file_id == case.id,
                CaseChecklistItem.active_flag == 1,
            )
        ).scalars()
    )
    if items and all(i.status_code == ChecklistStatus.VALIDATED for i in items):
        if case.status_code == CaseStatus.RECEIVING:
            transition(
                db, case, CaseStatus.IN_VALIDATION,
                actor=user.email, actor_user_id=user.id,
                descripcion="Todos los documentos validados, listo para validacion final",
            )
