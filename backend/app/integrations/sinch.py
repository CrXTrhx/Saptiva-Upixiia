"""Cliente de WhatsApp via Sinch — STUB de envio + verificacion de firma del webhook."""
from __future__ import annotations

import hashlib
import hmac


def verify_webhook_signature(secret: str, signature: str | None, body: bytes) -> bool:
    """Valida la firma HMAC-SHA256 del webhook entrante. FAIL-CLOSED.

    El proveedor firma el cuerpo CRUDO del POST con un secreto compartido y envia
    el hex en la cabecera. Se RECHAZA si no hay secreto configurado, si falta la
    firma o si no coincide. Se acepta el prefijo opcional `sha256=`.
    """
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    candidate = signature.split("=", 1)[1] if signature.startswith("sha256=") else signature
    return hmac.compare_digest(expected, candidate.strip())


def download_media(media_url: str) -> tuple[bytes, str, str]:
    """Devuelve (contenido, file_name, mime_type) del adjunto. Stub."""
    return (b"%PDF-1.4 stub whatsapp media", "documento_whatsapp.pdf", "application/pdf")


def send_message(to: str, text: str) -> None:
    # Stub: aqui iria el envio real al remitente.
    print(f"[sinch-stub] WhatsApp -> {to}: {text}")
