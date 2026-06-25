"""Logica comun de canales entrantes (WhatsApp / correo).

Si el mensaje trae un codigo de expediente valido -> se ingesta el documento al
expediente (pipeline). Si no -> entra a la cola de huerfanos.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CaseFile
from app.modules.canales import codigo_extractor
from app.modules.documentos import service as doc_service
from app.modules.huerfanos import service as orphan_service


def handle_inbound(
    db: Session,
    *,
    channel: str,
    sender: str | None,
    message_text: str | None,
    content: bytes,
    file_name: str,
    mime_type: str | None,
) -> dict:
    codigo = codigo_extractor.extract_codigo(message_text)
    case = None
    if codigo:
        case = db.execute(
            select(CaseFile).where(
                CaseFile.code == codigo, CaseFile.active_flag == 1
            )
        ).scalar_one_or_none()

    if case is not None:
        declared = codigo_extractor.infer_tipo(message_text, file_name)
        doc = doc_service.ingest_document(
            db, case,
            content=content, file_name=file_name, mime_type=mime_type,
            channel=channel, sender=sender, declared_type=declared,
            actor=sender or "cliente",
        )
        return {
            "status": "assigned",
            "codigo": case.code,
            "documentoId": str(doc.id),
            "reply": f"Recibimos tu documento para {case.code}.",
        }

    orphan = orphan_service.crear_huerfano(
        db,
        content=content, file_name=file_name, mime_type=mime_type,
        channel=channel, sender=sender, message_text=message_text,
    )
    return {
        "status": "orphan",
        "orphanId": str(orphan.id),
        "reply": "Recibimos tu documento pero no encontramos un codigo de expediente "
        "valido. Por favor responde con el codigo (formato EXP-AAAA-NNNNN).",
    }
