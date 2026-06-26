"""Webhooks de canales entrantes (Sinch WhatsApp / correo). Integracion real: stub.

No requieren JWT; en produccion validan la firma/secreto del proveedor. Aceptan un
payload simplificado para la demo. El adjunto puede venir en base64 (fileBase64) o,
si no, se usa un contenido de marcador.
"""
from __future__ import annotations

import base64

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.core.codes import Channel
from app.core.config import settings
from app.core.deps import get_db
from app.core.errors import UnauthorizedError
from app.integrations import email as email_client
from app.integrations import sinch
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
    if payload.sender:
        email_client.send_email(payload.sender, "Documento recibido", result["reply"])
    return result
