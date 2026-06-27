"""Webhooks de canales entrantes (Sinch WhatsApp / correo).

WhatsApp y el webhook de correo JSON (`/webhooks/email`) usan un payload simplificado
para la demo. El correo REAL llega por Mailgun a `/webhooks/email/mailgun` como
multipart/form-data con los adjuntos del cliente (ver `mailgun_inbound`).

No requieren JWT; validan la firma/secreto del proveedor.
"""
from __future__ import annotations

import base64
import json

from fastapi import APIRouter, BackgroundTasks, Depends, Header, Request
from sqlalchemy.orm import Session

from app.core.codes import Channel
from app.core.config import settings
from app.core.deps import get_db
from app.core.errors import UnauthorizedError
from app.integrations import email as email_client
from app.integrations import sinch
from app.modules.canales import ingest
from app.modules.canales.ingest import handle_inbound
from app.schemas.base import CamelModel

router = APIRouter(tags=["canales"])


class InboundPayload(CamelModel):
    sender: str | None = None
    text: str | None = None
    file_name: str | None = None
    mime_type: str | None = None
    file_base64: str | None = None


def _content(payload: InboundPayload, default_name: str) -> tuple[bytes, str, str]:
    name = payload.file_name or default_name
    mime = payload.mime_type or "application/pdf"
    if payload.file_base64:
        try:
            content = base64.b64decode(payload.file_base64)
        except Exception:
            content = b"%PDF-1.4 stub"
    else:
        content = b"%PDF-1.4 stub media"
    return content, name, mime


@router.post("/webhooks/whatsapp")
def whatsapp_webhook(
    payload: InboundPayload,
    db: Session = Depends(get_db),
    x_sinch_signature: str | None = Header(default=None),
):
    if not sinch.verify_webhook_signature(
        settings.sinch_webhook_secret, x_sinch_signature, b""
    ):
        raise UnauthorizedError("Firma de webhook invalida")
    content, name, mime = _content(payload, "documento_whatsapp.pdf")
    result = handle_inbound(
        db, channel=Channel.WHATSAPP, sender=payload.sender,
        message_text=payload.text, content=content, file_name=name, mime_type=mime,
    )
    if payload.sender:
        sinch.send_message(payload.sender, result["reply"])
    return result


@router.post("/webhooks/email")
def email_webhook(
    payload: InboundPayload,
    db: Session = Depends(get_db),
    x_email_signature: str | None = Header(default=None),
):
    if not email_client.verify_webhook_signature(
        settings.email_webhook_secret, x_email_signature, b""
    ):
        raise UnauthorizedError("Firma de webhook invalida")
    content, name, mime = _content(payload, "documento_correo.pdf")
    result = handle_inbound(
        db, channel=Channel.EMAIL, sender=payload.sender,
        message_text=payload.text, content=content, file_name=name, mime_type=mime,
    )
    # Solo acusamos recibo si el documento se asigno a un expediente valido. Si fue a
    # huerfanos (sin codigo o codigo inexistente), no se responde nada al remitente.
    if payload.sender and result["status"] == "assigned":
        email_client.send_email(payload.sender, "Documento recibido", result["reply"])
    return result


@router.post("/webhooks/email/mailgun")
async def mailgun_inbound(request: Request, background_tasks: BackgroundTasks):
    """Webhook de correo ENTRANTE de Mailgun (Routes -> forward a esta URL).

    Mailgun envia multipart/form-data con los campos del correo ya parseado
    (sender, subject, body-plain, ...) y los adjuntos como `attachment-1`,
    `attachment-2`, etc. El cliente debe poner su numero de expediente en el
    ASUNTO (o el cuerpo). Respondemos 200 de inmediato y procesamos los adjuntos
    en segundo plano para no exceder el timeout de Mailgun (evita reintentos /
    duplicados); el analisis (Document AI) corre dentro de ese procesamiento.
    """
    form = await request.form()

    timestamp = form.get("timestamp")
    token = form.get("token")
    signature = form.get("signature")
    if not email_client.verify_mailgun_signature(timestamp, token, signature):
        raise UnauthorizedError("Firma de Mailgun invalida")

    sender = form.get("sender") or form.get("from")
    subject = form.get("subject") or ""
    body = form.get("body-plain") or form.get("stripped-text") or ""

    # Mailgun nombra los adjuntos attachment-1, attachment-2, ... Hay que leer los
    # bytes AHORA (antes de responder); la BackgroundTask corre tras cerrar el request.
    attachments: list[tuple[bytes, str, str | None]] = []
    # Accion "Forward to URL": adjuntos como archivos multipart (attachment-1..N).
    for key, value in form.multi_items():
        if key.startswith("attachment-") and hasattr(value, "filename"):
            content = await value.read()
            if content:
                attachments.append(
                    (content, value.filename or "documento", value.content_type)
                )

    # Accion "Store and notify": adjuntos como URLs en el campo JSON `attachments`;
    # se descargan con la API key. Solo si no llegaron como archivos (evita duplicar).
    if not attachments:
        raw = form.get("attachments")
        if raw:
            try:
                meta = json.loads(raw)
            except (TypeError, ValueError):
                meta = []
            for item in meta:
                url = item.get("url")
                if not url:
                    continue
                content = email_client.download_attachment(url)
                if content:
                    attachments.append(
                        (content, item.get("name") or "documento", item.get("content-type"))
                    )

    background_tasks.add_task(
        ingest.process_email_attachments,
        sender=sender, subject=subject, body=body, attachments=attachments,
    )
    return {"status": "accepted", "attachments": len(attachments)}
