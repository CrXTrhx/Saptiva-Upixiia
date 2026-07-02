"""Logica de negocio de expedientes."""
from __future__ import annotations

import datetime as dt
import html as html_lib
import uuid
from urllib.parse import quote

from sqlalchemy import and_, case, func, or_, select, update
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
from app.models import (
    AppUser,
    CaseChecklistItem,
    CaseEvent,
    CaseFile,
    CaseOperation,
    CatChecklistTemplate,
    Document,
    InternalNote,
)
from app.integrations import email as email_client
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


def _materializar_checklist(db: Session, case_id, tipos: set[str]) -> None:
    """Crea los items de checklist (PENDING) como union de las plantillas de los
    tipos dados, deduplicando por document_type_code y respetando su sort_order."""
    rows = db.execute(
        select(CatChecklistTemplate.document_type_code)
        .where(
            CatChecklistTemplate.operation_type_code.in_(tipos),
            CatChecklistTemplate.active_flag == 1,
        )
        .group_by(CatChecklistTemplate.document_type_code)
        .order_by(func.min(CatChecklistTemplate.sort_order))
    ).all()
    for (doc_type,) in rows:
        db.add(
            CaseChecklistItem(
                case_file_id=case_id,
                document_type_code=doc_type,
                status_code=ChecklistStatus.PENDING,
            )
        )


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
        estimated_amount=req.total(),
        operation_type_code=req.operation_type_code(),
        assigned_user_id=user.id,
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(case)
    db.flush()  # genera id + code (trigger)
    db.refresh(case, ["code", "status_code"])

    # Operaciones de la venta (una fila por operacion).
    for orden, op in enumerate(req.operaciones):
        db.add(
            CaseOperation(
                case_file_id=case.id,
                operation_type_code=op.tipo,
                amount=op.monto,
                sort_order=orden,
            )
        )

    # Materializa el checklist como la UNION de las plantillas de los tipos reales de
    # la venta (dedupe por document_type_code). Para una venta mezclada (auto+blindaje)
    # la union son los mismos 4 docs de identidad; el resumen 'MIXED' no tiene plantilla.
    tipos = {op.tipo for op in req.operaciones}
    _materializar_checklist(db, case.id, tipos)
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
    if body.operaciones is not None:
        # Reemplaza la lista completa: desactiva las anteriores e inserta las nuevas,
        # luego recomputa el resumen (tipo unico o MIXED) y el total. El codigo del
        # expediente NO se regenera (es identificador estable compartido con el cliente).
        db.execute(
            update(CaseOperation)
            .where(
                CaseOperation.case_file_id == case.id,
                CaseOperation.active_flag == 1,
            )
            .values(active_flag=0)
        )
        for orden, op in enumerate(body.operaciones):
            db.add(
                CaseOperation(
                    case_file_id=case.id,
                    operation_type_code=op.tipo,
                    amount=op.monto,
                    sort_order=orden,
                )
            )
        case.estimated_amount = body.total()
        case.operation_type_code = body.operation_type_code()
        cambios.append("operaciones")
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


_ESTADOS_TERMINALES = (
    CaseStatus.CANCELLED,
    CaseStatus.ARCHIVED,
    CaseStatus.COMPLETE,
    CaseStatus.INCOMPLETE_EXPIRED,
)

_CHECKLIST_FALTANTE = (
    ChecklistStatus.PENDING,
    ChecklistStatus.REJECTED,
    ChecklistStatus.EXPIRED,
)


def _prioridad(*, case: CaseFile, ultima_map: dict) -> int:
    ultima = serializers.ultima_actividad_de(case, ultima_map)
    now = dt.datetime.now(dt.timezone.utc)
    inactivo = ultima is not None and (now - ultima) > _INACTIVIDAD
    if inactivo and case.status_code not in _ESTADOS_TERMINALES:
        return 0
    return _ESTADO_PRIORIDAD.get(case.status_code, 5)


def _orden_prioridad_sql():
    """Replica en SQL el orden visible del frontend para paginar correctamente."""
    ultima = func.coalesce(
        select(func.max(CaseEvent.event_at))
        .where(
            CaseEvent.case_file_id == CaseFile.id,
            CaseEvent.active_flag == 1,
        )
        .correlate(CaseFile)
        .scalar_subquery(),
        CaseFile.updated_at,
        CaseFile.created_at,
    )
    inactivo = ultima < (dt.datetime.now(dt.timezone.utc) - _INACTIVIDAD)
    return case(
        (
            and_(CaseFile.status_code.notin_(_ESTADOS_TERMINALES), inactivo),
            0,
        ),
        (CaseFile.status_code == CaseStatus.INCOMPLETE_EXPIRED, 0),
        (CaseFile.status_code == CaseStatus.IN_VALIDATION, 1),
        (CaseFile.status_code == CaseStatus.RECEIVING, 2),
        (CaseFile.status_code == CaseStatus.CAPTURING, 3),
        (CaseFile.status_code == CaseStatus.COMPLETE, 4),
        else_=5,
    )


def list_expedientes_pagina(
    db: Session,
    *,
    search: str | None = None,
    estado: str | None = None,
    desde: str | None = None,
    hasta: str | None = None,
    doc_faltante: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[CaseFile], int]:
    """Página ordenada por prioridad sin cargar la colección completa en memoria."""
    condiciones = [CaseFile.active_flag == 1]

    if search and search.strip():
        like = f"%{search.strip()}%"
        condiciones.append(
            or_(
                CaseFile.client_name.ilike(like),
                CaseFile.client_rfc.ilike(like),
                CaseFile.code.ilike(like),
                CaseFile.client_phone.ilike(like),
                CaseFile.client_email.ilike(like),
            )
        )
    if estado:
        condiciones.append(CaseFile.status_code == estado)
    if desde:
        condiciones.append(CaseFile.created_at >= dt.datetime.fromisoformat(desde))
    if hasta:
        condiciones.append(CaseFile.created_at <= dt.datetime.fromisoformat(hasta))
    if doc_faltante:
        condiciones.append(
            select(CaseChecklistItem.id)
            .where(
                CaseChecklistItem.case_file_id == CaseFile.id,
                CaseChecklistItem.active_flag == 1,
                CaseChecklistItem.document_type_code == doc_faltante,
                CaseChecklistItem.status_code.in_(_CHECKLIST_FALTANTE),
            )
            .correlate(CaseFile)
            .exists()
        )

    total = db.execute(
        select(func.count()).select_from(CaseFile).where(*condiciones)
    ).scalar_one()
    cases = list(
        db.execute(
            select(CaseFile)
            .where(*condiciones)
            .order_by(_orden_prioridad_sql(), CaseFile.created_at, CaseFile.id)
            .limit(limit)
            .offset(offset)
        ).scalars()
    )
    return cases, int(total)


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
    # Marca el reloj de auto-archivado: se archivara solo tras auto_archivar_dias.
    case.completed_at = dt.datetime.now(dt.timezone.utc)
    db.flush()
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


def restaurar(db: Session, case: CaseFile, user: AppUser) -> CaseFile:
    if case.status_code != CaseStatus.CANCELLED:
        raise ConflictError("Solo se puede restaurar un expediente cancelado")

    eventos = db.execute(
        select(CaseEvent)
        .where(
            CaseEvent.case_file_id == case.id,
            CaseEvent.event_type_code == EventType.STATUS_CHANGED,
        )
        .order_by(CaseEvent.event_at.desc())
    ).scalars()

    estado_previo = None
    for ev in eventos:
        meta = ev.event_metadata or {}
        if meta.get("to") == CaseStatus.CANCELLED:
            estado_previo = meta.get("from")
            break

    # Solo restauramos a un estado "abierto" valido; si no hay rastro, RECEIVING.
    if estado_previo not in OPEN_STATUSES:
        estado_previo = CaseStatus.RECEIVING

    # Importante: limpiar el motivo y cambiar el estado deben aplicarse en el MISMO
    # flush. La tabla tiene un CHECK (ck_case_cancel_reason) que exige motivo cuando
    # el estado es CANCELLED; si limpiamos el motivo antes de salir de CANCELLED,
    # se viola la restriccion. transition() hace el flush con ambos cambios juntos.
    case.cancellation_reason = None
    transition(
        db,
        case,
        estado_previo,
        actor=user.email,
        actor_user_id=user.id,
        descripcion="Expediente restaurado",
        force=True,
    )
    ns.recompute(db, case)
    return case


def archivar(db: Session, case: CaseFile, user: AppUser) -> CaseFile:
    transition(
        db, case, CaseStatus.ARCHIVED, actor=user.email, actor_user_id=user.id,
        descripcion="Expediente archivado",
    )
    case.archived_at = dt.datetime.now(dt.timezone.utc)
    db.flush()
    registrar_evento(
        db, case.id, EventType.CASE_ARCHIVED, "Expediente archivado",
        actor=user.email, actor_user_id=user.id,
    )
    ns.recompute(db, case)
    return case


def desarchivar(db: Session, case: CaseFile, user: AppUser) -> CaseFile:
    """Regresa un expediente archivado a COMPLETO (edicion habilitada de nuevo).

    Reinicia el reloj de auto-archivado (completed_at = ahora) para que no vuelva a
    archivarse de inmediato, y limpia archived_at. La transicion ARCHIVED -> COMPLETE
    ya deja registrado el cambio de estado en el timeline.
    """
    if case.status_code != CaseStatus.ARCHIVED:
        raise ConflictError("El expediente no esta archivado")
    transition(
        db, case, CaseStatus.COMPLETE, actor=user.email, actor_user_id=user.id,
        descripcion="Expediente desarchivado",
    )
    case.completed_at = dt.datetime.now(dt.timezone.utc)
    case.archived_at = None
    db.flush()
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
        f"Puedes responder a este mismo correo con los documentos adjuntos, o enviarlos "
        f"a {correo} con el codigo {codigo} en el asunto.",
        "",
        "Recomendaciones:",
        "  - Adjunta cada documento en PDF o foto (max. 15 MB por archivo).",
        "  - Puedes mandarlos todos en un solo correo o uno por uno.",
        "",
        "Gracias.",
    ]
    return "\n".join(lineas)


def _instrucciones_html_shell(nombre_html: str, cuerpo_html: str) -> str:
    """Envoltorio HTML comun del correo de instrucciones (nombre ya escapado)."""
    return (
        '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,'
        'sans-serif;max-width:560px;margin:0 auto;color:#302F2D;font-size:14px;'
        'line-height:1.6;">'
        f"<p>Hola {nombre_html},</p>"
        f"{cuerpo_html}"
        '<p style="margin-top:20px;">Gracias.</p>'
        "</div>"
    )


def instrucciones_html(db: Session, case: CaseFile) -> str:
    """Version HTML del correo de instrucciones.

    Igual contenido que `instrucciones_texto`, pero con un boton CTA cuyo `mailto:` abre
    un correo nuevo ya con el codigo del expediente en el ASUNTO. Asi el cliente puede
    (a) responder a este correo, o (b) tocar el boton: en ambos casos el codigo viaja
    solo, sin tener que escribirlo.
    """
    nombre = (case.client_name or "").strip().split(" ")[0] or "cliente"
    codigo = case.code
    correo = settings.system_email
    pendientes = _documentos_pendientes(db, case)
    esc = html_lib.escape
    accent = "#C07B3A"

    if not pendientes:
        cuerpo = (
            f"<p>Ya recibimos todos los documentos de tu expediente "
            f"<strong>{esc(codigo)}</strong>.</p>"
            "<p>Por ahora no necesitas enviar nada mas; te avisaremos del "
            "siguiente paso.</p>"
        )
        return _instrucciones_html_shell(esc(nombre), cuerpo)

    items = "".join(
        f'<li style="margin:4px 0;">{esc(label)}'
        + (f' <span style="color:#989396;">({esc(motivo)})</span>' if motivo else "")
        + "</li>"
        for label, motivo in pendientes
    )

    asunto_q = quote(codigo)
    body_q = quote(f"Adjunto mis documentos para el expediente {codigo}.")
    mailto = f"mailto:{correo}?subject={asunto_q}&body={body_q}"

    cuerpo = (
        f"<p>Para continuar con tu expediente <strong>{esc(codigo)}</strong> todavia "
        "nos faltan estos documentos:</p>"
        f'<ul style="padding-left:18px;margin:12px 0;">{items}</ul>'
        '<p style="margin:14px 0 16px;">Puedes responder a este mismo correo con los '
        "documentos adjuntos, o enviarlos a "
        f'<a href="mailto:{correo}?subject={asunto_q}" style="color:{accent};">'
        f"{esc(correo)}</a> con el codigo <strong>{esc(codigo)}</strong> en el asunto.</p>"
        f'<p style="margin:0 0 22px;"><a href="{mailto}" '
        f'style="display:inline-block;background:{accent};color:#ffffff;'
        "text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;"
        'font-size:14px;">Enviar mis documentos</a></p>'
        '<p style="margin:0 0 6px;font-weight:600;">Recomendaciones:</p>'
        '<ul style="padding-left:18px;margin:0;">'
        '<li style="margin:4px 0;">Adjunta cada documento en PDF o foto (max. 15 MB '
        "por archivo).</li>"
        '<li style="margin:4px 0;">Puedes mandarlos todos en un solo correo o uno por '
        "uno.</li>"
        "</ul>"
    )
    return _instrucciones_html_shell(esc(nombre), cuerpo)


def reenviar_instrucciones(db: Session, case: CaseFile, user: AppUser) -> dict:
    destinatario = (case.client_email or "").strip()
    if not destinatario:
        raise ConflictError("El expediente no tiene un correo registrado")
    subject = f"Documentos para tu expediente {case.code}"
    cuerpo = instrucciones_texto(db, case)
    cuerpo_html = instrucciones_html(db, case)
    # Reply-To con sub-addressing: la respuesta del cliente cae en la bandeja entrante
    # (no en un noreply) y lleva el codigo embebido, asi no tiene que escribirlo.
    reply_to = email_client.reply_to_for_code(case.code)
    enviado = email_client.send_email(
        destinatario, subject, cuerpo, html=cuerpo_html, reply_to=reply_to
    )
    registrar_evento(
        db, case.id, EventType.INSTRUCTIONS_RESENT,
        f"Instrucciones reenviadas por correo a {destinatario}",
        actor=user.email, actor_user_id=user.id,
    )
    return {"enviado": enviado, "correo": destinatario}
