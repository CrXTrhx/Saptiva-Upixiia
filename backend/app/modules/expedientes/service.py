"""Logica de negocio de expedientes."""
from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.codes import (
    CaseStatus,
    ChecklistStatus,
    EventType,
    OPEN_STATUSES,
)
from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError
from app.models import (
    AppUser,
    CaseChecklistItem,
    CaseFile,
    CatChecklistTemplate,
    InternalNote,
)
from app.modules.eventos import registrar_evento
from app.modules.expedientes import next_steps as ns
from app.modules.expedientes import serializers
from app.modules.expedientes.schemas import CreateExpedienteRequest
from app.modules.expedientes.state_machine import transition

_ESTADO_PRIORIDAD = {
    CaseStatus.INCOMPLETE_EXPIRED: 0,
    CaseStatus.IN_VALIDATION: 1,
    CaseStatus.RECEIVING: 2,
    CaseStatus.CAPTURING: 3,
    CaseStatus.COMPLETE: 4,
    CaseStatus.CANCELLED: 5,
    CaseStatus.ARCHIVED: 5,
}
_INACTIVIDAD = dt.timedelta(days=3)


def get_case_or_404(db: Session, case_id: str) -> CaseFile:
    try:
        uid = uuid.UUID(str(case_id))
    except (ValueError, TypeError):
        raise NotFoundError("Expediente no encontrado")
    case = db.execute(
        select(CaseFile).where(CaseFile.id == uid, CaseFile.active_flag == 1)
    ).scalar_one_or_none()
    if case is None:
        raise NotFoundError("Expediente no encontrado")
    return case


def create_expediente(
    db: Session, req: CreateExpedienteRequest, user: AppUser
) -> CaseFile:
    case = CaseFile(
        client_name=req.cliente_nombre.strip(),
        client_phone=req.cliente_telefono.strip(),
        client_email=req.cliente_correo,
        client_rfc=(req.cliente_rfc or None),
        estimated_amount=req.monto_estimado,
        operation_type_code=req.operation_type_code(),
        assigned_user_id=user.id,
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(case)
    db.flush()  # genera id + code (trigger)
    db.refresh(case, ["code", "status_code"])

    # Materializa el checklist desde la plantilla del tipo de operacion
    tmpl = db.execute(
        select(CatChecklistTemplate).where(
            CatChecklistTemplate.operation_type_code == case.operation_type_code,
            CatChecklistTemplate.active_flag == 1,
        )
    ).scalars()
    for row in tmpl:
        db.add(
            CaseChecklistItem(
                case_file_id=case.id,
                document_type_code=row.document_type_code,
                status_code=ChecklistStatus.PENDING,
            )
        )
    db.flush()

    registrar_evento(
        db,
        case.id,
        EventType.CASE_CREATED,
        f"Expediente {case.code} creado por {user.full_name}",
        actor=user.email,
        actor_user_id=user.id,
    )
    ns.recompute(db, case)
    return case


def editar_expediente(db: Session, case: CaseFile, body, user: AppUser) -> CaseFile:
    """Actualiza datos del cliente/operacion (solo los campos provistos)."""
    cambios: list[str] = []
    if body.cliente_nombre is not None:
        case.client_name = body.cliente_nombre.strip()
        cambios.append("nombre")
    if body.cliente_telefono is not None:
        case.client_phone = body.cliente_telefono.strip()
        cambios.append("telefono")
    if body.cliente_correo is not None:
        case.client_email = str(body.cliente_correo)
        cambios.append("correo")
    if body.cliente_rfc is not None:
        case.client_rfc = body.cliente_rfc or None
        cambios.append("rfc")
    if body.monto_estimado is not None:
        case.estimated_amount = body.monto_estimado
        cambios.append("monto")
    op_code = body.operation_type_code()
    if op_code is not None:
        case.operation_type_code = op_code
        cambios.append("tipo de operacion")
    case.updated_by = user.id
    db.flush()
    registrar_evento(
        db, case.id, EventType.CASE_UPDATED,
        f"Datos actualizados ({', '.join(cambios) or 'sin cambios'})",
        actor=user.email, actor_user_id=user.id,
    )
    return case


def list_expedientes(
    db: Session,
    *,
    search: str | None = None,
    estado: str | None = None,
    desde: str | None = None,
    hasta: str | None = None,
    doc_faltante: str | None = None,
) -> list[CaseFile]:
    stmt = select(CaseFile).where(CaseFile.active_flag == 1)

    if search and search.strip():
        like = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                CaseFile.client_name.ilike(like),
                CaseFile.client_rfc.ilike(like),
                CaseFile.code.ilike(like),
                CaseFile.client_phone.ilike(like),
                CaseFile.client_email.ilike(like),
            )
        )
    if estado:
        stmt = stmt.where(CaseFile.status_code == estado)
    if desde:
        stmt = stmt.where(CaseFile.created_at >= desde)
    if hasta:
        stmt = stmt.where(CaseFile.created_at <= hasta)

    cases = list(db.execute(stmt).scalars())

    if doc_faltante:
        cases = [
            c
            for c in cases
            if doc_faltante in serializers.documentos_faltantes(db, c.id)
        ]

    cases.sort(key=lambda c: (_prioridad(db, c), c.created_at))
    return cases


def _prioridad(db: Session, case: CaseFile) -> int:
    ultima = serializers._ultima_actividad(db, case)
    now = dt.datetime.now(dt.timezone.utc)
    inactivo = ultima is not None and (now - ultima) > _INACTIVIDAD
    if inactivo and case.status_code in (CaseStatus.CAPTURING, CaseStatus.RECEIVING):
        return 0
    return _ESTADO_PRIORIDAD.get(case.status_code, 5)


def conteos(db: Session) -> dict[str, int]:
    rows = db.execute(
        select(CaseFile.status_code, func.count())
        .where(CaseFile.active_flag == 1)
        .group_by(CaseFile.status_code)
    ).all()
    base = {s: 0 for s in _ESTADO_PRIORIDAD}
    for status_code, count in rows:
        base[status_code] = count
    return base


def marcar_completo(db: Session, case: CaseFile, user: AppUser) -> CaseFile:
    items = db.execute(
        select(CaseChecklistItem).where(
            CaseChecklistItem.case_file_id == case.id,
            CaseChecklistItem.active_flag == 1,
        )
    ).scalars()
    if not all(i.status_code == ChecklistStatus.VALIDATED for i in items):
        raise ConflictError(
            "No se puede completar: hay documentos del checklist sin validar"
        )
    if case.status_code == CaseStatus.RECEIVING:
        transition(db, case, CaseStatus.IN_VALIDATION, actor=user.email, actor_user_id=user.id)
    transition(
        db,
        case,
        CaseStatus.COMPLETE,
        actor=user.email,
        actor_user_id=user.id,
        descripcion="Expediente marcado como completo",
    )
    registrar_evento(
        db, case.id, EventType.CASE_COMPLETED, "Expediente validado y completo",
        actor=user.email, actor_user_id=user.id,
    )
    ns.recompute(db, case)
    return case


def cancelar(db: Session, case: CaseFile, motivo: str, user: AppUser) -> CaseFile:
    case.cancellation_reason = motivo.strip()
    db.flush()
    transition(
        db, case, CaseStatus.CANCELLED, actor=user.email, actor_user_id=user.id,
        descripcion=f"Cancelado: {motivo.strip()}",
    )
    registrar_evento(
        db, case.id, EventType.CASE_CANCELLED, f"Expediente cancelado: {motivo.strip()}",
        actor=user.email, actor_user_id=user.id,
    )
    ns.recompute(db, case)
    return case


def archivar(db: Session, case: CaseFile, user: AppUser) -> CaseFile:
    transition(
        db, case, CaseStatus.ARCHIVED, actor=user.email, actor_user_id=user.id,
        descripcion="Expediente archivado",
    )
    registrar_evento(
        db, case.id, EventType.CASE_ARCHIVED, "Expediente archivado",
        actor=user.email, actor_user_id=user.id,
    )
    ns.recompute(db, case)
    return case


def agregar_nota(db: Session, case: CaseFile, texto: str, user: AppUser) -> InternalNote:
    nota = InternalNote(case_file_id=case.id, author_id=user.id, body=texto.strip())
    db.add(nota)
    db.flush()
    registrar_evento(
        db, case.id, EventType.NOTE_ADDED, "Nota interna agregada",
        actor=user.email, actor_user_id=user.id,
    )
    return nota


def instrucciones_texto(case: CaseFile) -> str:
    return (
        f"Hola, para tu tramite con Centur usa este codigo de expediente: {case.code}\n\n"
        f"Envia tus documentos (INE, CURP, Constancia de Situacion Fiscal y comprobante "
        f"de domicilio) por cualquiera de estos medios, incluyendo SIEMPRE el codigo "
        f"{case.code} en el mensaje:\n"
        f"  - WhatsApp: {settings.system_whatsapp}\n"
        f"  - Correo: {settings.system_email}\n\n"
        f"Gracias."
    )


def reenviar_instrucciones(db: Session, case: CaseFile, user: AppUser) -> None:
    # Stub de canal: aqui iria el envio real por WhatsApp/correo.
    registrar_evento(
        db, case.id, EventType.INSTRUCTIONS_RESENT,
        "Instrucciones reenviadas al cliente",
        actor=user.email, actor_user_id=user.id,
    )
