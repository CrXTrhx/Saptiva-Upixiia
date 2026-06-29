"""Notificaciones por correo al cliente al validar o rechazar un documento.

Pensadas para ejecutarse como BackgroundTask de FastAPI: reciben solo primitivos
(no objetos de sesion) y abren su propia sesion para registrar el evento, igual que
`documentos.service.process_document`.

Nunca lanzan excepcion: `send_email` ya captura cualquier fallo de envio y el
registro del evento va protegido. Si el expediente no tiene correo registrado se
omiten en silencio (en el futuro aqui se enganchara el aviso por WhatsApp).
"""
from __future__ import annotations

import logging
import uuid

from app.core.codes import REJECTION_LABEL, EventType
from app.core.db import db_session
from app.integrations.email import send_email
from app.modules.eventos import registrar_evento
from app.modules.expedientes.next_steps import DOC_LABEL

logger = logging.getLogger(__name__)


def _doc_label(doc_type: str | None) -> str:
    return DOC_LABEL.get(doc_type, "documento") if doc_type else "documento"


def notificar_validacion(
    case_id: uuid.UUID,
    client_email: str | None,
    case_code: str,
    doc_type: str | None,
    actor: str = "system",
    actor_user_id: uuid.UUID | None = None,
) -> None:
    """Avisa al cliente que su documento fue aprobado. Segura como BackgroundTask."""
    correo = (client_email or "").strip()
    if not correo:
        return  # futuro: enganche de notificacion por WhatsApp
    etiqueta = _doc_label(doc_type)
    asunto = f"Tu documento {etiqueta} fue aprobado — expediente {case_code}"
    cuerpo = "\n".join(
        [
            "Hola,",
            "",
            f"Tu documento {etiqueta} del expediente {case_code} fue revisado y "
            "APROBADO. No necesitas hacer nada mas con este documento.",
            "",
            "Te avisaremos si hace falta algun otro documento.",
            "",
            "Gracias.",
        ]
    )
    send_email(correo, asunto, cuerpo)
    _registrar(
        case_id,
        EventType.CLIENT_NOTIFIED_VALIDATED,
        f"Correo de validacion enviado al cliente ({correo})",
        actor,
        actor_user_id,
    )


def notificar_rechazo(
    case_id: uuid.UUID,
    client_email: str | None,
    case_code: str,
    doc_type: str | None,
    motivo_code: str | None,
    nota: str | None,
    actor: str = "system",
    actor_user_id: uuid.UUID | None = None,
) -> None:
    """Avisa al cliente que su documento fue rechazado y por que. Segura como BackgroundTask."""
    correo = (client_email or "").strip()
    if not correo:
        return  # futuro: enganche de notificacion por WhatsApp
    etiqueta = _doc_label(doc_type)
    motivo = REJECTION_LABEL.get(motivo_code, "otro motivo")
    lineas = [
        "Hola,",
        "",
        f"Tu documento {etiqueta} del expediente {case_code} fue revisado y NO pudo "
        f"ser aceptado: {motivo}.",
    ]
    if nota and nota.strip():
        lineas += ["", f"Detalle: {nota.strip()}"]
    lineas += [
        "",
        "Por favor envianos una nueva version del documento para continuar con tu "
        "expediente.",
        "",
        "Gracias.",
    ]
    asunto = f"Tu documento {etiqueta} fue rechazado — expediente {case_code}"
    send_email(correo, asunto, "\n".join(lineas))
    _registrar(
        case_id,
        EventType.CLIENT_NOTIFIED_REJECTED,
        f"Correo de rechazo enviado al cliente ({correo})",
        actor,
        actor_user_id,
    )


def _registrar(
    case_id: uuid.UUID,
    event_type: str,
    descripcion: str,
    actor: str,
    actor_user_id: uuid.UUID | None,
) -> None:
    """Registra el evento de notificacion en su propia sesion. No rompe el envio."""
    try:
        with db_session(
            user_id=str(actor_user_id) if actor_user_id else None,
            user_label=actor,
        ) as db:
            registrar_evento(
                db,
                case_id,
                event_type,
                descripcion,
                actor=actor,
                actor_user_id=actor_user_id,
            )
    except Exception:
        logger.exception("No se pudo registrar el evento de notificacion al cliente")
