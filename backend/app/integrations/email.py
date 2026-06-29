"""Correo entrante/saliente via Mailgun.

Saliente (confirmaciones al cliente): API HTTP de Mailgun /v3/{domain}/messages.
Entrante (documentos del cliente): Mailgun Routes hace POST al webhook de la app;
aqui validamos la firma HMAC del POST.

Si NO hay credenciales configuradas (MAILGUN_API_KEY vacio) el envio cae a un stub
que solo imprime, para no romper el entorno de desarrollo ni las pruebas.
"""
from __future__ import annotations

import hashlib
import hmac
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


def _mailgun_configured() -> bool:
    return bool(settings.mailgun_api_key and settings.mailgun_domain)


def verify_webhook_signature(secret: str, signature: str | None, body: bytes) -> bool:
    """Compatibilidad con el webhook JSON simplificado (no Mailgun). Stub: confia."""
    return True


def verify_mailgun_signature(
    timestamp: str | None, token: str | None, signature: str | None
) -> bool:
    """Valida la firma de un webhook entrante de Mailgun.

    Mailgun firma asi:  HMAC-SHA256(key=signing_key, msg=timestamp + token).
    Si no se configuro la signing key se OMITE la validacion (se asume confiable),
    util para las primeras pruebas; en produccion conviene configurarla.
    """
    signing_key = settings.mailgun_signing_key or settings.mailgun_api_key
    if not signing_key:
        logger.warning(
            "MAILGUN_SIGNING_KEY no configurada; se omite la verificacion de firma."
        )
        return True
    if not (timestamp and token and signature):
        return False
    expected = hmac.new(
        key=signing_key.encode("utf-8"),
        msg=f"{timestamp}{token}".encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def reply_to_for_code(code: str | None) -> str | None:
    """Construye la direccion de respuesta con el codigo embebido (sub-addressing).

    A partir de SYSTEM_EMAIL (`documentos@mg.digitalfoldr.com`) genera
    `documentos+EXP-2026-BLN00057-WQAC@mg.digitalfoldr.com`. Asi, cuando el cliente
    RESPONDE al correo, su mensaje viaja a una direccion que ya lleva el codigo; el
    webhook entrante lo extrae del destinatario y no hace falta que el cliente escriba
    nada. Requiere que la Route de Mailgun acepte el sufijo `+...` (ver DEPLOY).

    Devuelve None si no hay un correo base o un codigo (el llamador omite el header).
    """
    base = settings.system_email
    if not (base and code and "@" in base):
        return None
    local, domain = base.split("@", 1)
    return f"{local}+{code}@{domain}"


def download_attachment(url: str) -> bytes | None:
    """Descarga un adjunto almacenado en Mailgun (accion 'store and notify').

    En esa accion los adjuntos no llegan como archivos sino como URLs protegidas
    que se descargan con la API key. Devuelve None si falla (no rompe el flujo).
    """
    if not settings.mailgun_api_key:
        logger.warning("Sin MAILGUN_API_KEY no se puede descargar el adjunto %s", url)
        return None
    try:
        resp = httpx.get(url, auth=("api", settings.mailgun_api_key), timeout=30.0)
        resp.raise_for_status()
        return resp.content
    except Exception as exc:
        logger.error("No se pudo descargar el adjunto de Mailgun %s: %s", url, exc)
        return None


def send_email(
    to: str,
    subject: str,
    body: str,
    *,
    html: str | None = None,
    reply_to: str | None = None,
) -> bool:
    """Envia un correo via Mailgun. Devuelve True si se envio.

    - `body`: texto plano (fallback obligatorio).
    - `html`: version con formato (botones/CTA). Mailgun manda ambos (multipart/alt).
    - `reply_to`: cabecera Reply-To. Sirve para que la RESPUESTA del cliente caiga en
      la bandeja entrante (no en un noreply) y, con sub-addressing, lleve el codigo.

    El remitente sale de MAIL_FROM; si no esta configurado usa SYSTEM_EMAIL (la bandeja
    a la que el cliente envia sus documentos) para que el correo sea respondible, y solo
    como ultimo recurso un `noreply@`.

    Sin credenciales configuradas cae a un stub (imprime) para dev/tests. Nunca lanza
    excepcion: si el envio falla, lo registra y devuelve False para no interrumpir el
    flujo que lo llamo.
    """
    if not _mailgun_configured():
        extra = f" | reply-to={reply_to}" if reply_to else ""
        print(f"[email-stub] -> {to} | {subject}{extra}: {body}")
        return False
    url = f"{settings.mailgun_base_url.rstrip('/')}/v3/{settings.mailgun_domain}/messages"
    sender = (
        settings.mail_from
        or settings.system_email
        or f"noreply@{settings.mailgun_domain}"
    )
    data = {"from": sender, "to": to, "subject": subject, "text": body}
    if html:
        data["html"] = html
    if reply_to:
        data["h:Reply-To"] = reply_to  # cabecera custom de Mailgun (prefijo h:)
    try:
        resp = httpx.post(
            url,
            auth=("api", settings.mailgun_api_key),
            data=data,
            timeout=15.0,
        )
        resp.raise_for_status()
        return True
    except Exception as exc:  # no romper el flujo si el correo falla
        logger.error("Fallo al enviar correo via Mailgun a %s: %s", to, exc)
        return False
