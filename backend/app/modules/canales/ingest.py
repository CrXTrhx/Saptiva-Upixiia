"""Logica comun de canales entrantes (WhatsApp / correo).

Si el mensaje trae un codigo de expediente valido -> se ingesta el documento al
expediente (pipeline). Si no -> entra a la cola de huerfanos.
"""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.codes import Channel
from app.core.db import db_session
from app.integrations import email as email_client
from app.models import CaseFile
from app.modules.canales import codigo_extractor
from app.modules.documentos import service as doc_service
from app.modules.huerfanos import service as orphan_service

logger = logging.getLogger(__name__)

# Sentinela: por defecto, el tipo declarado se infiere del mismo texto del mensaje
# (comportamiento de WhatsApp). Pasar declared_type_text=None lo desactiva y deja que
# el tipo se infiera SOLO del nombre del adjunto (util en correos con varios documentos).
_USE_MESSAGE_TEXT: str | None = object()  # type: ignore[assignment]


def handle_inbound(
    db: Session,
    *,
    channel: str,
    sender: str | None,
    message_text: str | None,
    content: bytes,
    file_name: str,
    mime_type: str | None,
    declared_type_text: str | None = _USE_MESSAGE_TEXT,
) -> dict:
    codigo = codigo_extractor.extract_codigo(message_text)
    # El codigo siempre se busca en message_text (asunto+cuerpo). El TIPO declarado, en
    # cambio, usa `declared_type_text`: por defecto el mismo texto, pero el correo lo pone
    # en None para inferir el tipo solo del nombre de cada adjunto (evita TYPE_MISMATCH
    # cuando un mismo correo trae varios documentos distintos).
    tipo_text = (
        message_text if declared_type_text is _USE_MESSAGE_TEXT else declared_type_text
    )
    case = None
    if codigo:
        case = db.execute(
            select(CaseFile).where(
                CaseFile.code == codigo, CaseFile.active_flag == 1
            )
        ).scalar_one_or_none()

    if case is not None:
        declared = codigo_extractor.infer_tipo(tipo_text, file_name)
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


def process_email_attachments(
    *,
    sender: str | None,
    subject: str | None,
    body: str | None,
    attachments: list[tuple[bytes, str, str | None]],
) -> None:
    """Procesa (en segundo plano) los adjuntos de un correo entrante de Mailgun.

    Corre FUERA del request (BackgroundTask), por lo que abre su propia sesion. Por
    cada adjunto ejecuta la logica comun de canales (handle_inbound -> pipeline de
    extraccion / cola de huerfanos). El codigo de expediente puede venir tanto en el
    ASUNTO como en el cuerpo del correo; ambos se concatenan para buscarlo. Al final
    envia un correo de confirmacion al remitente con el resumen.
    """
    # El codigo puede venir en el asunto o el cuerpo: se busca en ambos.
    message_text = "\n".join(p for p in (subject, body) if p)
    asignados: list[str] = []
    huerfanos: list[str] = []
    codigo: str | None = None

    if attachments:
        try:
            with db_session(user_label=sender or "cliente-correo") as db:
                for content, file_name, mime_type in attachments:
                    res = handle_inbound(
                        db, channel=Channel.EMAIL, sender=sender,
                        message_text=message_text, content=content,
                        file_name=file_name, mime_type=mime_type,
                        # Un correo puede traer varios documentos distintos: el tipo se
                        # infiere por archivo (nombre del adjunto), no del cuerpo comun.
                        declared_type_text=None,
                    )
                    if res["status"] == "assigned":
                        asignados.append(file_name)
                        codigo = res.get("codigo")
                    else:
                        huerfanos.append(file_name)
        except Exception:
            logger.exception("Error procesando adjuntos de correo entrante de %s", sender)

    _enviar_confirmacion(
        sender, codigo, asignados, huerfanos, hubo_adjuntos=bool(attachments)
    )


def _enviar_confirmacion(
    sender: str | None,
    codigo: str | None,
    asignados: list[str],
    huerfanos: list[str],
    *,
    hubo_adjuntos: bool,
) -> None:
    """Avisa al cliente que recibimos (o no) sus documentos. No falla si el correo no sale."""
    if not sender:
        return

    if not hubo_adjuntos:
        email_client.send_email(
            sender,
            "No recibimos archivos adjuntos",
            "Recibimos tu correo pero no traia archivos adjuntos. Por favor responde "
            "adjuntando tus documentos (PDF o foto) e incluye tu codigo de expediente "
            "(formato EXP-AAAA-NNNNN) en el asunto.",
        )
        return

    lineas: list[str] = []
    if asignados:
        lineas.append(
            f"Recibimos {len(asignados)} documento(s) para tu expediente {codigo}:"
        )
        lineas += [f"  - {n}" for n in asignados]
        lineas.append("")
        lineas.append("Los estamos analizando. Te avisaremos si necesitamos algo mas.")
    if huerfanos:
        if asignados:
            lineas.append("")
        lineas.append(
            f"No pudimos asignar {len(huerfanos)} archivo(s) porque no encontramos un "
            "codigo de expediente valido:"
        )
        lineas += [f"  - {n}" for n in huerfanos]
        lineas.append("")
        lineas.append(
            "Por favor responde indicando tu codigo de expediente "
            "(formato EXP-AAAA-NNNNN) en el asunto del correo."
        )

    asunto = f"Documentos recibidos — {codigo}" if codigo else "Documentos recibidos"
    email_client.send_email(sender, asunto, "\n".join(lineas))
