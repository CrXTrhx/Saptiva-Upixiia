"""Cliente de WhatsApp via Sinch — STUB. La integracion real se conecta despues."""
from __future__ import annotations


def verify_webhook_signature(secret: str, signature: str | None, body: bytes) -> bool:
    # Stub: en produccion validar la firma HMAC de Sinch.
    return True


def download_media(media_url: str) -> tuple[bytes, str, str]:
    """Devuelve (contenido, file_name, mime_type) del adjunto. Stub."""
    return (b"%PDF-1.4 stub whatsapp media", "documento_whatsapp.pdf", "application/pdf")


def send_message(to: str, text: str) -> None:
    # Stub: aqui iria el envio real al remitente.
    print(f"[sinch-stub] WhatsApp -> {to}: {text}")
