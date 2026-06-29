"""Notificacion al cliente (digest) tras validar/rechazar documentos.

Objetivo: NO hacer spam. Si el operador valida/rechaza varios documentos de un
expediente seguidos (o de a uno en pocos minutos), el cliente recibe UN solo correo
con el resumen (aprobados + rechazados con motivo), no uno por documento.

Mecanismo ligero, sin tablas ni colas externas:
- Cada validacion/rechazo agenda `programar_digest` como BackgroundTask.
- Es un *debounce* asincrono: espera `VENTANA_DEBOUNCE_SEG`; si en ese lapso hubo
  mas actividad en el expediente, esta tarea se hace a un lado (otra posterior
  enviara). Solo la tarea que sigue a la ULTIMA accion de la rafaga manda el correo.
- La "cola" es la propia tabla de eventos: se resume todo lo resuelto desde el ultimo
  correo resumen (`CLIENT_NOTIFIED_DIGEST`).

Nunca rompe el flujo: `send_email` ya captura fallos y aqui todo va protegido. Si el
expediente no tiene correo registrado se omite (futuro: aviso por WhatsApp).
"""
from __future__ import annotations

import asyncio
import datetime as dt
import logging
import uuid

from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from app.core.codes import REJECTION_LABEL, DocStatus, EventType
from app.core.config import settings
from app.core.db import db_session
from app.integrations import email_templates
from app.integrations.email import send_email
from app.models import CaseEvent, CaseFile, Document
from app.modules.eventos import registrar_evento
from app.modules.expedientes.next_steps import DOC_LABEL

logger = logging.getLogger(__name__)

# Ventana de "silencio": tras la ultima validacion/rechazo en un expediente se espera
# este tiempo; si no hubo mas actividad, se manda UN correo con el resumen.
VENTANA_DEBOUNCE_SEG = 120
# Cota para el primer correo resumen (sin digest previo): solo se consideran
# resoluciones recientes, para no listar documentos validados hace mucho.
COTA_PRIMER_DIGEST = dt.timedelta(hours=1)


async def programar_digest(
    case_id: uuid.UUID,
    actor: str = "system",
    actor_user_id: uuid.UUID | None = None,
) -> None:
    """Debounce en proceso: espera la ventana y, si el operador ya no toco mas
    documentos del expediente, envia un unico correo resumen al cliente."""
    try:
        await asyncio.sleep(VENTANA_DEBOUNCE_SEG)
        await run_in_threadpool(
            _enviar_digest_si_corresponde, case_id, actor, actor_user_id
        )
    except Exception:  # nunca propagar desde un BackgroundTask
        logger.exception("Fallo al programar/enviar el digest de notificacion")


def _enviar_digest_si_corresponde(
    case_id: uuid.UUID, actor: str, actor_user_id: uuid.UUID | None
) -> None:
    with db_session(
        user_id=str(actor_user_id) if actor_user_id else None, user_label=actor
    ) as db:
        case = db.get(CaseFile, case_id)
        if case is None:
            return
        correo = (case.client_email or "").strip()
        if not correo:
            return  # futuro: enganche de notificacion por WhatsApp

        ahora = dt.datetime.now(dt.timezone.utc)
        since = _ultimo_digest_at(db, case_id) or (ahora - COTA_PRIMER_DIGEST)
        aprobados, rechazados, ultima_actividad = _resoluciones_desde(db, case_id, since)
        if not aprobados and not rechazados:
            return  # nada nuevo desde el ultimo resumen

        # Debounce: si la ultima resolucion es muy reciente, el operador sigue
        # trabajando; dejamos que la siguiente tarea (la de la ultima accion) envie.
        if ultima_actividad and (ahora - ultima_actividad).total_seconds() < (
            VENTANA_DEBOUNCE_SEG - 1
        ):
            return

        nombre = (case.client_name or "").strip().split(" ")[0] or "cliente"
        aprobados_lbl = [_label(d) for d in aprobados]
        rechazados_info = [(_label(d), _motivo_texto(d)) for d in rechazados]
        asunto = f"Actualizacion de tu expediente {case.code}"
        texto = _redactar_texto(case.code, aprobados_lbl, rechazados_info)
        html = email_templates.digest_html(
            nombre, case.code, aprobados_lbl, rechazados_info, settings.system_email
        )
        send_email(correo, asunto, texto, html=html)
        registrar_evento(
            db,
            case_id,
            EventType.CLIENT_NOTIFIED_DIGEST,
            f"Correo resumen enviado al cliente ({correo}): "
            f"{len(aprobados)} aprobado(s), {len(rechazados)} rechazado(s)",
            actor=actor,
            actor_user_id=actor_user_id,
        )


def _ultimo_digest_at(db, case_id: uuid.UUID) -> dt.datetime | None:
    return db.execute(
        select(CaseEvent.event_at)
        .where(
            CaseEvent.case_file_id == case_id,
            CaseEvent.event_type_code == EventType.CLIENT_NOTIFIED_DIGEST,
        )
        .order_by(CaseEvent.event_at.desc())
        .limit(1)
    ).scalar()


def _resoluciones_desde(
    db, case_id: uuid.UUID, since: dt.datetime
) -> tuple[list[Document], list[Document], dt.datetime | None]:
    """Documentos aprobados/rechazados (manualmente) de este expediente desde `since`."""
    validados = list(
        db.execute(
            select(Document).where(
                Document.case_file_id == case_id,
                Document.active_flag == 1,
                Document.status_code == DocStatus.VALIDATED,
                Document.validated_at.is_not(None),
                Document.validated_at > since,
            )
        ).scalars()
    )
    rechazados = list(
        db.execute(
            select(Document).where(
                Document.case_file_id == case_id,
                Document.active_flag == 1,
                Document.status_code == DocStatus.REJECTED,
                Document.is_auto_rejected == 0,
                Document.updated_at > since,
            )
        ).scalars()
    )
    tiempos = [d.validated_at for d in validados if d.validated_at]
    tiempos += [d.updated_at for d in rechazados if d.updated_at]
    return validados, rechazados, (max(tiempos) if tiempos else None)


def _label(doc: Document) -> str:
    t = doc.declared_type_code or doc.detected_type_code
    return DOC_LABEL.get(t, "documento") if t else "documento"


def _motivo_texto(doc: Document) -> str:
    motivo = REJECTION_LABEL.get(doc.rejection_reason_code, "otro motivo")
    if doc.rejection_note and doc.rejection_note.strip():
        motivo += f" — detalle: {doc.rejection_note.strip()}"
    return motivo


def _redactar_texto(
    case_code: str,
    aprobados: list[str],
    rechazados: list[tuple[str, str]],
) -> str:
    """Version en texto plano (fallback) del correo resumen."""
    lineas = ["Hola,", "", f"Resumen de la revision de tu expediente {case_code}:"]
    if aprobados:
        lineas += ["", "Documentos APROBADOS:"]
        lineas += [f"  - {lbl}" for lbl in aprobados]
    if rechazados:
        lineas += ["", "Documentos RECHAZADOS (envia una nueva version):"]
        lineas += [f"  - {lbl}: {motivo}" for lbl, motivo in rechazados]
    lineas += ["", "Gracias."]
    return "\n".join(lineas)
