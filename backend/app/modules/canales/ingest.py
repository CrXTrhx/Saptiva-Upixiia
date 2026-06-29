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
    recipient: str | None = None,
) -> None:
    """Procesa (en segundo plano) los adjuntos de un correo entrante de Mailgun.

    Corre FUERA del request (BackgroundTask), por lo que abre su propia sesion. Por
    cada adjunto ejecuta la logica comun de canales (handle_inbound -> pipeline de
    extraccion / cola de huerfanos). El codigo de expediente puede venir en el
    DESTINATARIO (sub-addressing `documentos+EXP-...@`, cuando el cliente RESPONDE al
    correo), en el ASUNTO (`Re: ... EXP-...`) o en el cuerpo; se buscan en ese orden de
    prioridad concatenandolos.

    Solo se responde al remitente cuando los documentos se asignaron a un expediente
    valido (acuse de recibo). Si el correo no trae un expediente valido (sin codigo o
    con uno inexistente) o no trae adjuntos, los archivos quedan en la cola de
    huerfanos en silencio: NO se envia ningun correo.
    """
    # El codigo puede venir en el destinatario (tag +EXP-...), el asunto o el cuerpo.
    # Se pone el destinatario primero para que el sub-addressing tenga prioridad.
    message_text = "\n".join(p for p in (recipient, subject, body) if p)
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

    if huerfanos:
        # Correos sin expediente valido: los adjuntos ya quedaron en la cola de
        # huerfanos. NO se avisa al remitente (decision de producto); se registra
        # para trazabilidad/soporte.
        logger.info(
            "Correo de %s: %d archivo(s) sin expediente valido -> huerfanos (sin aviso)",
            sender or "?", len(huerfanos),
        )

    _enviar_confirmacion(sender, codigo, asignados)


def _enviar_confirmacion(
    sender: str | None,
    codigo: str | None,
    asignados: list[str],
) -> None:
    """Acuse de recibo al cliente, SOLO cuando sus documentos se asignaron a un
    expediente valido.

    Si el correo no trae un expediente valido (sin codigo o con uno inexistente), o no
    trae adjuntos, sus archivos quedan en la cola de huerfanos en silencio: NO se
    responde nada (ni "sin adjuntos" ni "no encontramos tu codigo"). No falla si el
    correo no sale.
    """
    if not sender or not asignados:
        return

    lineas = [
        f"Recibimos {len(asignados)} documento(s) para tu expediente {codigo}:",
        *[f"  - {n}" for n in asignados],
        "",
        "Los estamos analizando. Te avisaremos si necesitamos algo mas.",
    ]
    email_client.send_email(
        sender, f"Documentos recibidos — {codigo}", "\n".join(lineas)
    )
