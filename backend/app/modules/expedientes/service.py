"""Logica de negocio de expedientes."""
from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.codes import (
    CaseStatus,
    ChecklistStatus,
    DocStatus,
    DocType,
    EventType,
    OPEN_STATUSES,
    RejectionReason,
)
from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError
from app.integrations import email
from app.models import (
    AppUser,
    CaseChecklistItem,
    CaseFile,
    CatChecklistTemplate,
    Document,
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
    rfc = (req.cliente_rfc or "").strip().upper() or None

    # Si ya existe un cliente con este RFC, el nuevo expediente se ASOCIA a el (la
    # relacion es por RFC). Heredamos CURP / codigo postal del expediente mas
    # reciente de ese cliente para mantener consistente el emparejamiento de
    # documentos huerfanos.
    prev_curp = prev_cp = None
    if rfc:
        prev = db.execute(
            select(CaseFile)
            .where(CaseFile.client_rfc == rfc, CaseFile.active_flag == 1)
            .order_by(CaseFile.created_at.desc())
        ).scalars().first()
        if prev:
            prev_curp = prev.client_curp
            prev_cp = prev.client_postal_code

    case = CaseFile(
        client_name=req.cliente_nombre.strip(),
        client_phone=req.cliente_telefono.strip(),
        client_email=req.cliente_correo,
        client_rfc=rfc,
        client_curp=prev_curp,
        client_postal_code=prev_cp,
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
        stmt = stmt.where(CaseFile.created_at >= dt.datetime.fromisoformat(desde))
    if hasta:
        stmt = stmt.where(CaseFile.created_at <= dt.datetime.fromisoformat(hasta))

    cases = list(db.execute(stmt).scalars())

    if doc_faltante:
        falt_map = serializers.documentos_faltantes_map(db, [c.id for c in cases])
        cases = [c for c in cases if doc_faltante in falt_map.get(c.id, [])]

    # Una sola query batch para la ultima actividad (antes era 1 por caso en el sort).
    ultima_map = serializers.ultima_actividad_map(db, [c.id for c in cases])
    cases.sort(key=lambda c: (_prioridad(case=c, ultima_map=ultima_map), c.created_at))
    return cases


def _prioridad(*, case: CaseFile, ultima_map: dict) -> int:
    ultima = serializers.ultima_actividad_de(case, ultima_map)
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


# Etiquetas en espanol para el correo al cliente (copy humano, no contrato de API).
_DOC_TYPE_ES = {
    DocType.OFFICIAL_ID: "INE",
    DocType.CURP: "CURP",
    DocType.TAX_STATUS_CERT: "Constancia de Situacion Fiscal",
    DocType.PROOF_OF_ADDRESS: "Comprobante de domicilio",
}
# Redactados para encajar tras "lo rechazamos porque ..." (ver _documentos_pendientes).
_REJECTION_ES = {
    RejectionReason.ILLEGIBLE: "no se leia con claridad",
    RejectionReason.TYPE_MISMATCH: "no coincidia con el documento solicitado",
    RejectionReason.EXPIRED: "estaba vencido",
    RejectionReason.OTHER: "no era valido",
}


def _motivo_rechazo(db: Session, case_id, doc_type: str) -> str:
    """Motivo (en espanol) del documento rechazado mas reciente de un tipo."""
    doc = db.execute(
        select(Document)
        .where(
            Document.case_file_id == case_id,
            Document.active_flag == 1,
            Document.status_code == DocStatus.REJECTED,
            func.coalesce(Document.detected_type_code, Document.declared_type_code)
            == doc_type,
        )
        .order_by(Document.reception_at.desc())
    ).scalars().first()
    if doc and doc.rejection_reason_code:
        return _REJECTION_ES.get(doc.rejection_reason_code, "no era valido")
    return "necesita revisarse"


def _documentos_pendientes(db: Session, case: CaseFile) -> list[tuple[str, str]]:
    """[(etiqueta, motivo)] de los documentos que el cliente debe enviar o reenviar.

    Incluye los que faltan (PENDING), fueron rechazados (REJECTED) o vencieron
    (EXPIRED); omite los ya recibidos/validados (no requieren accion del cliente).
    """
    items = db.execute(
        select(CaseChecklistItem)
        .where(
            CaseChecklistItem.case_file_id == case.id,
            CaseChecklistItem.active_flag == 1,
        )
        .order_by(CaseChecklistItem.created_at)
    ).scalars()
    pendientes: list[tuple[str, str]] = []
    for item in items:
        estado = item.status_code
        if estado in (ChecklistStatus.VALIDATED, ChecklistStatus.RECEIVED):
            continue
        label = _DOC_TYPE_ES.get(item.document_type_code, item.document_type_code)
        if estado == ChecklistStatus.REJECTED:
            motivo = f"lo rechazamos porque {_motivo_rechazo(db, case.id, item.document_type_code)}"
        elif estado == ChecklistStatus.EXPIRED:
            motivo = "el que tenemos ya esta vencido"
        else:  # PENDING
            motivo = "aun no lo recibimos"
        pendientes.append((label, motivo))
    return pendientes


def instrucciones_texto(db: Session, case: CaseFile) -> str:
    nombre = (case.client_name or "").strip().split(" ")[0] or "cliente"
    codigo = case.code
    correo = settings.system_email
    pendientes = _documentos_pendientes(db, case)

    lineas = [f"Hola {nombre},", ""]

    if not pendientes:
        lineas += [
            f"Ya recibimos todos los documentos de tu expediente {codigo}.",
            "Por ahora no necesitas enviar nada mas; te avisaremos del siguiente paso.",
            "",
            "Gracias.",
        ]
        return "\n".join(lineas)

    lineas.append(
        f"Para continuar con tu expediente {codigo} todavia nos faltan estos documentos:"
    )
    lineas.append("")
    for label, motivo in pendientes:
        lineas.append(f"  - {label} ({motivo})" if motivo else f"  - {label}")
    lineas += [
        "",
        f"Envialos por correo a {correo} e incluye el codigo {codigo} en el asunto; "
        "asi los asociamos a tu expediente automaticamente.",
        "",
        "Recomendaciones:",
        "  - Adjunta cada documento en PDF o foto (max. 15 MB por archivo).",
        "  - Puedes mandarlos todos en un solo correo o uno por uno.",
        "",
        "Gracias.",
    ]
    return "\n".join(lineas)


def reenviar_instrucciones(db: Session, case: CaseFile, user: AppUser) -> str:
    """Envia las instrucciones por correo al cliente del expediente (Mailgun).

    Devuelve el destinatario. Lanza ConflictError si el expediente no tiene correo
    registrado o si el envio falla.
    """
    destinatario = (case.client_email or "").strip()
    if not destinatario:
        raise ConflictError("El expediente no tiene un correo registrado")
    cuerpo = instrucciones_texto(db, case)
    if not email.send_email(destinatario, case.code, cuerpo):
        raise ConflictError("No se pudo enviar el correo")
    registrar_evento(
        db, case.id, EventType.INSTRUCTIONS_RESENT,
        f"Instrucciones reenviadas por correo a {destinatario}",
        actor=user.email, actor_user_id=user.id,
    )
    return destinatario
