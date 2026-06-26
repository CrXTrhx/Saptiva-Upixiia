"""Pasos del pipeline de extraccion/validacion (piezas independientes).

Cada paso recibe el PipelineContext y lo muta. En v1 se agregan pasos nuevos al
final (listas negras, PEP, scoring) sin tocar los anteriores. El orden lo define
la lista STEPS en runner.py.
"""
from __future__ import annotations

import datetime as dt

from app.core.codes import (
    CaseStatus,
    ChecklistStatus,
    DocStatus,
    DocType,
    EventType,
    RejectionReason,
)
from app.core.config import settings
from app.integrations import document_api
from app.models import CaseChecklistItem, CatDocumentType
from app.modules.eventos import registrar_evento
from app.modules.expedientes import next_steps as ns
from app.modules.expedientes.state_machine import transition
from app.modules.pipeline.context import PipelineContext


def detectar_tipo(ctx: PipelineContext) -> None:
    """Paso 1: asume el tipo declarado por el remitente como punto de partida."""
    ctx.detected_type = ctx.declared_type


def extraer(ctx: PipelineContext) -> None:
    """Paso 2: llama a la Document API (stub) y recibe campos + confianza."""
    if ctx.rejected:
        return
    try:
        res = document_api.extract(ctx.file_name, ctx.mime_type, ctx.declared_type)
    except document_api.DocumentApiError as exc:
        ctx.reject(RejectionReason.ILLEGIBLE, str(exc))
        return
    ctx.detected_type = res.detected_type or ctx.declared_type
    ctx.confidence = res.confidence
    ctx.issue_date = res.issue_date
    ctx.expiry_date = res.expiry_date
    ctx.fields = res.fields


def _compute_expiry(
    db, doc_type: str | None, issue_date: dt.date | None, doc_expiry: dt.date | None
) -> tuple[dt.date | None, bool]:
    """Devuelve (expiry_date, expired_now) segun las reglas del catalogo."""
    if not doc_type:
        return doc_expiry, False
    cat = db.get(CatDocumentType, doc_type)
    today = dt.date.today()
    if cat is None or cat.never_expires:
        return None, False
    if cat.uses_document_expiry:  # INE: usa la vigencia del propio documento
        return doc_expiry, bool(doc_expiry and doc_expiry < today)
    if cat.expires_with_fiscal_year:  # CSF: vigente solo el anio fiscal en curso
        if issue_date is None:
            return None, False
        expiry = dt.date(issue_date.year, 12, 31)  # fin del anio fiscal de emision
        return expiry, issue_date.year < today.year
    if cat.validity_months and issue_date:  # comprobante: emision + N meses
        months = cat.validity_months
        year = issue_date.year + (issue_date.month - 1 + months) // 12
        month = (issue_date.month - 1 + months) % 12 + 1
        day = min(issue_date.day, 28)
        expiry = dt.date(year, month, day)
        return expiry, expiry < today
    return doc_expiry, False


def validar_calidad(ctx: PipelineContext) -> None:
    """Paso 3: decision automatica (ilegible / tipo no coincide / vencido)."""
    if ctx.rejected:
        return

    if ctx.confidence is not None and ctx.confidence < settings.extraction_confidence_threshold:
        ctx.reject(
            RejectionReason.ILLEGIBLE,
            f"Confianza de extraccion {ctx.confidence:.0f}% por debajo del umbral",
        )
        return

    if (
        ctx.declared_type
        and ctx.detected_type
        and ctx.declared_type != ctx.detected_type
        and ctx.declared_type != DocType.OTHER
    ):
        ctx.reject(
            RejectionReason.TYPE_MISMATCH,
            f"Se declaro {ctx.declared_type} pero se detecto {ctx.detected_type}",
        )
        return

    expiry, expired_now = _compute_expiry(
        ctx.db, ctx.detected_type, ctx.issue_date, ctx.expiry_date
    )
    ctx.expiry_date = expiry
    if expired_now:
        ctx.reject(RejectionReason.EXPIRED, "El documento esta vencido al momento de recepcion")


def persistir(ctx: PipelineContext) -> None:
    """Paso 4: guarda el resultado en el documento."""
    doc = ctx.document
    doc.detected_type_code = ctx.detected_type
    doc.extracted_data = ctx.fields or None
    doc.extraction_confidence = ctx.confidence
    doc.issue_date = ctx.issue_date
    doc.expiry_date = ctx.expiry_date
    if ctx.rejected:
        doc.status_code = DocStatus.REJECTED
        doc.rejection_reason_code = ctx.reject_reason
        doc.rejection_note = ctx.reject_note
        doc.is_auto_rejected = 1
    else:
        doc.status_code = DocStatus.RECEIVED
    ctx.db.flush()


def actualizar_expediente(ctx: PipelineContext) -> None:
    """Paso 5: recalcula checklist + estado + next steps."""
    doc = ctx.document
    doc_type = ctx.detected_type or ctx.declared_type
    if doc_type and doc_type != DocType.OTHER:
        item = (
            ctx.db.query(CaseChecklistItem)
            .filter(
                CaseChecklistItem.case_file_id == ctx.case.id,
                CaseChecklistItem.document_type_code == doc_type,
                CaseChecklistItem.active_flag == 1,
            )
            .one_or_none()
        )
        if item:
            if ctx.rejected:
                item.status_code = ChecklistStatus.REJECTED
            else:
                item.status_code = ChecklistStatus.RECEIVED
                item.current_document_id = doc.id
            ctx.db.flush()

    if ctx.case.status_code == CaseStatus.CAPTURING:
        transition(
            ctx.db, ctx.case, CaseStatus.RECEIVING,
            actor=ctx.actor, actor_user_id=ctx.actor_user_id,
            descripcion="Primer documento recibido",
        )

    # Si todo el checklist ya esta presente (recibido/validado), pasa a validacion.
    items = list(
        ctx.db.query(CaseChecklistItem).filter(
            CaseChecklistItem.case_file_id == ctx.case.id,
            CaseChecklistItem.active_flag == 1,
        )
    )
    present = {ChecklistStatus.RECEIVED, ChecklistStatus.VALIDATED}
    if (
        items
        and all(i.status_code in present for i in items)
        and ctx.case.status_code == CaseStatus.RECEIVING
    ):
        transition(
            ctx.db, ctx.case, CaseStatus.IN_VALIDATION,
            actor=ctx.actor, actor_user_id=ctx.actor_user_id,
            descripcion="Checklist completo, listo para validacion final",
        )

    ns.recompute(ctx.db, ctx.case)


def notificar(ctx: PipelineContext) -> None:
    """Paso 6: timeline + alerta interna si hubo rechazo automatico."""
    label = ctx.detected_type or ctx.declared_type or "documento"
    registrar_evento(
        ctx.db, ctx.case.id, EventType.DOCUMENT_RECEIVED,
        f"Documento {label} recibido por {ctx.document.channel_code}",
        actor=ctx.actor, actor_user_id=ctx.actor_user_id,
    )
    if ctx.rejected:
        registrar_evento(
            ctx.db, ctx.case.id, EventType.DOCUMENT_AUTO_REJECTED,
            f"Documento {label} rechazado automaticamente: {ctx.reject_note}",
            actor="system",
        )
