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


def _ensure_case_editable(db: Session, doc: Document) -> None:
    """Defensa en profundidad: un expediente ARCHIVED o CANCELLED es de solo lectura y
    no admite mutaciones de sus documentos. La UI ya lo bloquea (esSoloLectura); este
    guard lo hace fail-closed tambien a nivel de API, para cualquier llamada directa."""
    case = db.get(CaseFile, doc.case_file_id)
    if case is not None and case.status_code in (CaseStatus.ARCHIVED, CaseStatus.CANCELLED):
        raise ConflictError(
            "El expediente es de solo lectura (archivado o cancelado); "
            "no admite cambios en sus documentos"
        )


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
    stored = storage.store(
        content, file_name, mime_type, prefix=case.code, doc_type=declared_type
    )
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
    stored = storage.store(
        content, file_name, mime_type, prefix=case.code, doc_type=declared_type
    )
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
    _ensure_case_editable(db, doc)
    if doc.status_code == DocStatus.VALIDATED:
        return doc
    doc.status_code = DocStatus.VALIDATED
    doc.rejection_reason_code = None
    doc.rejection_note = None
    doc.is_auto_rejected = 0
    doc.validated_by_id = user.id
    doc.validated_at = dt.datetime.now(dt.timezone.utc)
    db.flush()

    doc_type = doc.declared_type_code or doc.detected_type_code
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
    _ensure_case_editable(db, doc)
    doc.status_code = DocStatus.REJECTED
    doc.rejection_reason_code = categoria
    doc.rejection_note = texto
    doc.is_auto_rejected = 0
    db.flush()

    doc_type = doc.declared_type_code or doc.detected_type_code
    item = _checklist_item(db, doc.case_file_id, doc_type)
    if item and item.current_document_id == doc.id:
        item.status_code = ChecklistStatus.REJECTED
        item.current_document_id = None
        db.flush()
    elif item and item.current_document_id is None and item.status_code != ChecklistStatus.VALIDATED:
        # Solo se degrada el item cuando esta HUERFANO (sin documento vigente). Si apunta
        # a OTRO documento aun valido (rechazamos una version anterior / duplicado no
        # vigente), el tipo sigue satisfecho: no se toca el checklist y, por tanto, un
        # expediente EN VALIDACION / COMPLETO no se regresa a recepcion por error.
        item.status_code = ChecklistStatus.REJECTED
        db.flush()

    case = db.get(CaseFile, doc.case_file_id)
    registrar_evento(
        db, case.id, EventType.DOCUMENT_REJECTED,
        f"Documento {doc_type or ''} rechazado por {user.full_name}: {texto}",
        actor=user.email, actor_user_id=user.id,
    )
    # Un rechazo solo regresa el expediente a recepcion si de verdad rompio la
    # completitud del checklist. Rechazar un documento que NO es el vigente de su tipo
    # (p.ej. una version superseded o un duplicado que nunca fue el actual) deja el
    # checklist intacto; en ese caso un expediente COMPLETO / EN VALIDACION debe
    # conservar su estado y su reloj de completado (completed_at).
    if case.status_code in (CaseStatus.IN_VALIDATION, CaseStatus.COMPLETE):
        items = list(
            db.execute(
                select(CaseChecklistItem).where(
                    CaseChecklistItem.case_file_id == case.id,
                    CaseChecklistItem.active_flag == 1,
                )
            ).scalars()
        )
        presentes = {ChecklistStatus.RECEIVED, ChecklistStatus.VALIDATED}
        completitud_intacta = bool(items) and all(
            i.status_code in presentes for i in items
        )
        if not completitud_intacta:
            if case.status_code == CaseStatus.COMPLETE:
                case.completed_at = None
            transition(
                db, case, CaseStatus.RECEIVING,
                actor=user.email, actor_user_id=user.id,
                descripcion="Documento rechazado, regresa a recepcion",
            )
    ns.recompute(db, case)
    return doc


def revertir_rechazo(db: Session, doc: Document, user: AppUser) -> Document:
    """Revierte un rechazo (PRD §5): el documento vuelve a 'recibido'."""
    _ensure_case_editable(db, doc)
    if doc.status_code != DocStatus.REJECTED:
        raise ConflictError("El documento no esta rechazado")
    doc.status_code = DocStatus.RECEIVED
    doc.rejection_reason_code = None
    doc.rejection_note = None
    doc.is_auto_rejected = 0
    db.flush()

    doc_type = doc.declared_type_code or doc.detected_type_code
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


def descartar_documento(db: Session, doc: Document, user: AppUser) -> Document:
    """Descarta un documento rechazado: sale del flujo activo pero se conserva.

    Solo aplica a documentos en estado REJECTED. El documento pasa a DISCARDED y se
    registra `discarded_at`; si el item del checklist lo apuntaba, se libera para que
    el tipo vuelva a quedar pendiente.
    """
    _ensure_case_editable(db, doc)
    if doc.status_code != DocStatus.REJECTED:
        raise ConflictError("Solo se pueden descartar documentos rechazados")
    doc.status_code = DocStatus.DISCARDED
    doc.discarded_at = dt.datetime.now(dt.timezone.utc)
    db.flush()

    doc_type = doc.declared_type_code or doc.detected_type_code
    item = _checklist_item(db, doc.case_file_id, doc_type)
    if item and item.current_document_id == doc.id:
        item.current_document_id = None
        if item.status_code != ChecklistStatus.VALIDATED:
            item.status_code = ChecklistStatus.PENDING
        db.flush()

    case = db.get(CaseFile, doc.case_file_id)
    registrar_evento(
        db, case.id, EventType.DOCUMENT_DISCARDED,
        f"Documento {doc_type or ''} descartado por {user.full_name}",
        actor=user.email, actor_user_id=user.id,
    )
    ns.recompute(db, case)
    return doc


def restaurar_descartado(db: Session, doc: Document, user: AppUser) -> Document:
    """Restaura un documento descartado: vuelve a 'rechazado' (inverso de descartar).

    Conserva el motivo de rechazo original para que el usuario pueda retomarlo
    (revalidar, reemplazar, etc.). Si mientras tanto ya existe otro documento activo
    del mismo tipo (p.ej. se subio uno nuevo despues de descartar este), el restaurado
    lo REEMPLAZA en vez de duplicar el tipo: el activo pasa a REPLACED y queda como
    "version anterior" del restaurado (mismo patron que reemplazar_documento).
    """
    _ensure_case_editable(db, doc)
    if doc.status_code != DocStatus.DISCARDED:
        raise ConflictError("El documento no esta descartado")

    doc_type = doc.declared_type_code or doc.detected_type_code
    es_tipo_checklist = bool(doc_type) and doc_type != DocType.OTHER

    activo = None
    if es_tipo_checklist:
        otros = db.execute(
            select(Document).where(
                Document.case_file_id == doc.case_file_id,
                Document.id != doc.id,
                Document.active_flag == 1,
                Document.status_code.notin_([DocStatus.REPLACED, DocStatus.DISCARDED]),
            )
        ).scalars()
        activo = next(
            (d for d in otros if (d.declared_type_code or d.detected_type_code) == doc_type),
            None,
        )

    if activo:
        activo.status_code = DocStatus.REPLACED
        activo.replaced_by_id = doc.id
        db.flush()

    doc.status_code = DocStatus.REJECTED
    doc.discarded_at = None
    db.flush()

    item = _checklist_item(db, doc.case_file_id, doc_type)
    if item:
        # El doc restaurado queda REJECTED, igual que rechazar_documento: sin
        # "documento actual" hasta que se valide/reemplace de nuevo.
        item.status_code = ChecklistStatus.REJECTED
        item.current_document_id = None
        db.flush()

    case = db.get(CaseFile, doc.case_file_id)
    descripcion = f"Documento {doc_type or ''} restaurado desde descartados por {user.full_name}"
    if activo:
        descripcion += ", reemplazo al documento activo del mismo tipo"
    registrar_evento(
        db, case.id, EventType.DOCUMENT_RESTORED,
        descripcion,
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
    _ensure_case_editable(db, doc)
    case = db.get(CaseFile, doc.case_file_id)
    declared = doc.declared_type_code or doc.detected_type_code

    # Igual que la subida nueva: el documento entrante queda en PROCESSING y se
    # analiza con Document AI en segundo plano (process_document). Asi el frontend
    # muestra la animacion de "en analisis" tambien al reemplazar.
    nuevo = create_processing_document(
        db, case,
        content=content, file_name=file_name, mime_type=mime_type,
        channel=Channel.DIRECT_UPLOAD, sender=user.email, declared_type=declared,
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


def restaurar_version(db: Session, doc: Document, user: AppUser) -> Document:
    """Restaura la version anterior de un documento (inverso de reemplazar).

    `doc` es el documento vigente. Busca la version inmediatamente anterior
    (la que apunta a `doc` via replaced_by_id) y la vuelve a dejar activa,
    enviando `doc` al historico. Es un swap de roles, por lo que solo se puede
    retroceder un nivel: la version que se restaura mostrara a `doc` como su
    nueva "version anterior".
    """
    _ensure_case_editable(db, doc)
    prev = db.execute(
        select(Document)
        .where(Document.replaced_by_id == doc.id)
        .order_by(Document.reception_at.desc())
    ).scalars().first()
    if prev is None:
        raise ConflictError("El documento no tiene una version anterior")

    # La version anterior vuelve a estar vigente, pendiente de revalidacion.
    prev.status_code = DocStatus.RECEIVED
    prev.replaced_by_id = None
    prev.rejection_reason_code = None
    prev.rejection_note = None
    prev.is_auto_rejected = 0

    # El documento vigente pasa al historico apuntando a la version restaurada,
    # de modo que ahora figure como su version anterior (intercambio de roles).
    doc.status_code = DocStatus.REPLACED
    doc.replaced_by_id = prev.id
    db.flush()

    case = db.get(CaseFile, doc.case_file_id)
    doc_type = prev.detected_type_code or prev.declared_type_code
    item = _checklist_item(db, prev.case_file_id, doc_type)
    if item:
        item.status_code = ChecklistStatus.RECEIVED
        item.current_document_id = prev.id
        db.flush()

    registrar_evento(
        db, case.id, EventType.DOCUMENT_REPLACED,
        f"Documento {doc_type or ''} restaurado a la version anterior por {user.full_name}",
        actor=user.email, actor_user_id=user.id,
    )
    ns.recompute(db, case)
    return prev


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
