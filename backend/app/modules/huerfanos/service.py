"""Cola de documentos huerfanos: ingreso, listado, asignacion, descarte."""
from __future__ import annotations

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.codes import Channel, EventType, OrphanStatus
from app.core.errors import ConflictError, NotFoundError
from app.integrations import document_api, storage
from app.models import AppUser, CaseFile, OrphanDocument
from app.modules.documentos import service as doc_service
from app.modules.eventos import registrar_evento
from app.schemas.base import iso


def crear_huerfano(
    db: Session,
    *,
    content: bytes,
    file_name: str,
    mime_type: str | None,
    channel: str,
    sender: str | None,
    message_text: str | None,
) -> OrphanDocument:
    """Almacena el archivo, intenta extraer datos y propone un match."""
    stored = storage.store(content, file_name, mime_type)

    extracted_curp = extracted_rfc = extracted_cp = None
    suggested_type = None
    fields: dict | None = None
    try:
        res = document_api.extract(stored.file_name, stored.mime_type, None)
        fields = res.fields
        suggested_type = res.detected_type
        extracted_curp = (res.fields or {}).get("curp")
        extracted_rfc = (res.fields or {}).get("rfc")
        extracted_cp = (res.fields or {}).get("codigo_postal")
    except document_api.DocumentApiError:
        pass

    suggested_case = _match_case(db, extracted_curp, extracted_rfc)

    orphan = OrphanDocument(
        file_url=stored.url,
        file_name=stored.file_name,
        mime_type=stored.mime_type,
        channel_code=channel,
        sender=sender,
        message_text=message_text,
        extracted_data=fields,
        extracted_curp=extracted_curp,
        extracted_rfc=extracted_rfc,
        extracted_postal_code=extracted_cp,
        suggested_document_type_code=suggested_type,
        suggested_case_file_id=suggested_case.id if suggested_case else None,
        status_code=OrphanStatus.PENDING,
    )
    db.add(orphan)
    db.flush()
    return orphan


def _match_case(db: Session, curp: str | None, rfc: str | None) -> CaseFile | None:
    if not curp and not rfc:
        return None
    conds = []
    if curp:
        conds.append(CaseFile.client_curp == curp)
    if rfc:
        conds.append(CaseFile.client_rfc == rfc)
    return db.execute(
        select(CaseFile).where(CaseFile.active_flag == 1, or_(*conds))
    ).scalars().first()


def get_orphan_or_404(db: Session, orphan_id: str) -> OrphanDocument:
    try:
        uid = uuid.UUID(str(orphan_id))
    except (ValueError, TypeError):
        raise NotFoundError("Documento huerfano no encontrado")
    orphan = db.execute(
        select(OrphanDocument).where(
            OrphanDocument.id == uid, OrphanDocument.active_flag == 1
        )
    ).scalar_one_or_none()
    if orphan is None:
        raise NotFoundError("Documento huerfano no encontrado")
    return orphan


def list_pending(db: Session) -> list[OrphanDocument]:
    return list(
        db.execute(
            select(OrphanDocument)
            .where(
                OrphanDocument.active_flag == 1,
                OrphanDocument.status_code == OrphanStatus.PENDING,
            )
            .order_by(OrphanDocument.reception_at.desc())
        ).scalars()
    )


def count_pending(db: Session) -> int:
    return (
        db.execute(
            select(func.count())
            .select_from(OrphanDocument)
            .where(
                OrphanDocument.active_flag == 1,
                OrphanDocument.status_code == OrphanStatus.PENDING,
            )
        ).scalar()
        or 0
    )


def asignar(
    db: Session,
    orphan: OrphanDocument,
    case: CaseFile,
    tipo: str | None,
    user: AppUser,
):
    if orphan.status_code != OrphanStatus.PENDING:
        raise ConflictError("El documento huerfano ya fue procesado")

    declared = tipo or orphan.suggested_document_type_code
    doc = doc_service.ingest_existing(
        db, case,
        file_url=orphan.file_url,
        file_name=orphan.file_name or "documento",
        mime_type=orphan.mime_type,
        channel=orphan.channel_code,
        sender=orphan.sender,
        declared_type=declared,
        actor=user.email,
        actor_user_id=user.id,
    )
    orphan.status_code = OrphanStatus.ASSIGNED
    orphan.assigned_case_file_id = case.id
    orphan.resulting_document_id = doc.id
    db.flush()

    registrar_evento(
        db, case.id, EventType.ORPHAN_ASSIGNED,
        f"Documento asignado desde la cola de huerfanos (remitente {orphan.sender})",
        actor=user.email, actor_user_id=user.id,
    )
    return doc


def descartar(db: Session, orphan: OrphanDocument, motivo: str, user: AppUser) -> None:
    if orphan.status_code != OrphanStatus.PENDING:
        raise ConflictError("El documento huerfano ya fue procesado")
    orphan.status_code = OrphanStatus.DISCARDED
    orphan.discard_reason = motivo.strip()
    db.flush()


def serialize_orphan(db: Session, orphan: OrphanDocument) -> dict:
    suggested = None
    if orphan.suggested_case_file_id:
        case = db.get(CaseFile, orphan.suggested_case_file_id)
        if case:
            suggested = {"id": str(case.id), "codigo": case.code, "clienteNombre": case.client_name}
    return {
        "id": str(orphan.id),
        "archivoUrl": orphan.file_url,
        "filename": orphan.file_name or "documento",
        "mimeType": orphan.mime_type or "application/octet-stream",
        "canal": orphan.channel_code,
        "remitente": orphan.sender or "",
        "textoMensaje": orphan.message_text or "",
        "fechaRecepcion": iso(orphan.reception_at),
        "datosExtraidos": orphan.extracted_data or None,
        "tipoSugerido": orphan.suggested_document_type_code,
        "expedienteSugerido": suggested,
        "estado": orphan.status_code,
    }
