"""Serializadores: ORM -> dicts camelCase con codigos en ingles (contrato frontend)."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.codes import (
    EVENT_TONE,
    ChecklistStatus,
    DocStatus,
    NextStepStatus,
)
from app.integrations import storage
from app.models import (
    AppUser,
    CaseChecklistItem,
    CaseEvent,
    CaseFile,
    Document,
    InternalNote,
    NextStep,
)
from app.modules.expedientes import next_steps as ns
from app.schemas.base import iso

_MISSING_CHECKLIST = {
    ChecklistStatus.PENDING,
    ChecklistStatus.REJECTED,
    ChecklistStatus.EXPIRED,
}


def _capturista_nombre(db: Session, case: CaseFile) -> str:
    if not case.assigned_user_id:
        return "Sin asignar"
    user = db.get(AppUser, case.assigned_user_id)
    return user.full_name if user else "Sin asignar"


def _ultima_actividad(db: Session, case: CaseFile):
    last = db.execute(
        select(CaseEvent.event_at)
        .where(CaseEvent.case_file_id == case.id, CaseEvent.active_flag == 1)
        .order_by(CaseEvent.event_at.desc())
        .limit(1)
    ).scalar()
    return last or case.updated_at or case.created_at


def documentos_faltantes(db: Session, case_id) -> list[str]:
    items = db.execute(
        select(CaseChecklistItem).where(
            CaseChecklistItem.case_file_id == case_id,
            CaseChecklistItem.active_flag == 1,
        )
    ).scalars()
    return [i.document_type_code for i in items if i.status_code in _MISSING_CHECKLIST]


def _build_expediente_dict(
    case: CaseFile,
    *,
    next_prio: str,
    capturista: str,
    faltantes: list[str],
    ultima,
) -> dict:
    """Arma el dict de un expediente (item de lista). Funcion PURA (sin BD): la
    usan tanto serialize_expediente (single) como serialize_expedientes_bulk para
    garantizar salida identica."""
    return {
        "id": str(case.id),
        "codigo": case.code,
        "clienteNombre": case.client_name,
        "clienteRfc": case.client_rfc,
        "clienteTelefono": case.client_phone or "",
        "clienteCorreo": case.client_email or "",
        "fechaCreacion": iso(case.created_at),
        "estado": case.status_code,
        "montoEstimado": float(case.estimated_amount),
        "tipoOperacion": case.operation_type_code,
        "nextStepPrioritario": next_prio,
        "capturista": capturista,
        "documentosFaltantes": faltantes,
        "ultimaActividad": iso(ultima),
    }


def serialize_expediente(db: Session, case: CaseFile) -> dict:
    """Item de lista (tipo Expediente del frontend). Version de un solo caso."""
    return _build_expediente_dict(
        case,
        next_prio=ns.prioritario(db, case.id),
        capturista=_capturista_nombre(db, case),
        faltantes=documentos_faltantes(db, case.id),
        ultima=_ultima_actividad(db, case),
    )


# --- Serializacion en lote (sin N+1): la lista de expedientes precalcula 4 mapas
#     en ~4 queries set-based, en vez de ~4 queries POR caso. Salida identica. -----

def ultima_actividad_map(db: Session, case_ids: list) -> dict:
    """{case_id: ultimo event_at} (1 query). Sin entrada si el caso no tiene eventos."""
    if not case_ids:
        return {}
    rows = db.execute(
        select(CaseEvent.case_file_id, func.max(CaseEvent.event_at))
        .where(CaseEvent.case_file_id.in_(case_ids), CaseEvent.active_flag == 1)
        .group_by(CaseEvent.case_file_id)
    ).all()
    return {cid: last for cid, last in rows}


def ultima_actividad_de(case: CaseFile, ultima_map: dict):
    """Mismo fallback que _ultima_actividad pero usando el mapa batch."""
    return ultima_map.get(case.id) or case.updated_at or case.created_at


def documentos_faltantes_map(db: Session, case_ids: list) -> dict:
    """{case_id: [document_type_code faltantes]} (1 query)."""
    if not case_ids:
        return {}
    rows = db.execute(
        select(
            CaseChecklistItem.case_file_id,
            CaseChecklistItem.document_type_code,
            CaseChecklistItem.status_code,
        )
        .where(
            CaseChecklistItem.case_file_id.in_(case_ids),
            CaseChecklistItem.active_flag == 1,
        )
    ).all()
    out: dict = {}
    for cid, doc_type, status in rows:
        if status in _MISSING_CHECKLIST:
            out.setdefault(cid, []).append(doc_type)
    return out


def _capturistas_map(db: Session, user_ids: list) -> dict:
    """{user_id: full_name} (1 query). Sin filtro de active_flag (como db.get)."""
    if not user_ids:
        return {}
    rows = db.execute(
        select(AppUser.id, AppUser.full_name).where(AppUser.id.in_(user_ids))
    ).all()
    return {uid: name for uid, name in rows}


def _next_prio_map(db: Session, case_ids: list) -> dict:
    """{case_id: descripcion del next step prioritario} (1 query). Mismo orden que
    next_steps.pending_steps (PRIORITY_ORDER, luego created_at)."""
    if not case_ids:
        return {}
    rows = list(
        db.execute(
            select(NextStep).where(
                NextStep.case_file_id.in_(case_ids),
                NextStep.active_flag == 1,
                NextStep.status_code == NextStepStatus.PENDING,
            )
        ).scalars()
    )
    grouped: dict = {}
    for s in rows:
        grouped.setdefault(s.case_file_id, []).append(s)
    out: dict = {}
    for cid, steps in grouped.items():
        steps.sort(key=lambda s: (ns.PRIORITY_ORDER.get(s.priority_code, 9), s.created_at))
        out[cid] = steps[0].description
    return out


def serialize_expedientes_bulk(db: Session, cases: list[CaseFile]) -> list[dict]:
    """Serializa una lista de expedientes con ~4 queries batch (sin N+1). Produce
    el MISMO dict por caso que serialize_expediente."""
    if not cases:
        return []
    case_ids = [c.id for c in cases]
    user_ids = list({c.assigned_user_id for c in cases if c.assigned_user_id})

    cap_map = _capturistas_map(db, user_ids)
    falt_map = documentos_faltantes_map(db, case_ids)
    prio_map = _next_prio_map(db, case_ids)
    ult_map = ultima_actividad_map(db, case_ids)

    result = []
    for c in cases:
        if c.assigned_user_id and c.assigned_user_id in cap_map:
            capturista = cap_map[c.assigned_user_id]
        else:
            capturista = "Sin asignar"
        result.append(
            _build_expediente_dict(
                c,
                next_prio=prio_map.get(c.id, "Sin acciones pendientes"),
                capturista=capturista,
                faltantes=falt_map.get(c.id, []),
                ultima=ultima_actividad_de(c, ult_map),
            )
        )
    return result


def serialize_documento(
    db: Session,
    doc: Document,
    with_version: bool = True,
    prev_map: dict | None = None,
) -> dict:
    motivo = None
    if doc.rejection_reason_code:
        motivo = {
            "categoria": doc.rejection_reason_code,
            "texto": doc.rejection_note or "",
        }
    version_anterior = None
    if with_version:
        # La version anterior es el documento que fue reemplazado por este.
        # Tras una restauracion puede existir mas de un candidato (cadena de
        # reemplazos): tomamos el mas reciente para mostrar SOLO un nivel atras.
        # Si se pasa prev_map (precalculado en lote), se evita la query por-doc.
        if prev_map is not None:
            prev = prev_map.get(doc.id)
        else:
            prev = db.execute(
                select(Document)
                .where(Document.replaced_by_id == doc.id)
                .order_by(Document.reception_at.desc())
            ).scalars().first()
        if prev:
            version_anterior = serialize_documento(db, prev, with_version=False)

    return {
        "id": str(doc.id),
        "tipo": doc.declared_type_code or doc.detected_type_code or "OTHER",
        "estado": doc.status_code,
        "filename": doc.file_name or "documento",
        "archivoUrl": storage.resolve_url(doc.file_url),
        "mimeType": doc.mime_type or "application/octet-stream",
        "canal": doc.channel_code,
        "remitente": doc.sender or "",
        "fechaRecepcion": iso(doc.reception_at),
        "datosExtraidos": doc.extracted_data or None,
        "motivoRechazo": motivo,
        "rechazoAutomatico": bool(doc.is_auto_rejected),
        "versionAnterior": version_anterior,
    }


def serialize_checklist_item(item: CaseChecklistItem) -> dict:
    return {
        "tipo": item.document_type_code,
        "estado": item.status_code,
        "documentoId": str(item.current_document_id) if item.current_document_id else None,
    }


def serialize_next_step(step) -> dict:
    return {
        "id": str(step.id),
        "texto": step.description,
        "prioridad": step.priority_code,
    }


def serialize_evento(ev: CaseEvent) -> dict:
    return {
        "id": str(ev.id),
        "tipo": ev.event_type_code,
        "descripcion": ev.description or "",
        "timestamp": iso(ev.event_at),
        "tono": EVENT_TONE.get(ev.event_type_code, "neutral"),
    }


def serialize_nota(
    db: Session, nota: InternalNote, autor_map: dict | None = None
) -> dict:
    # autor_map (precalculado en lote) evita un db.get por nota.
    if autor_map is not None:
        autor_nombre = autor_map[nota.author_id] if nota.author_id in autor_map else "Interno"
    else:
        autor = db.get(AppUser, nota.author_id)
        autor_nombre = autor.full_name if autor else "Interno"
    return {
        "id": str(nota.id),
        "texto": nota.body,
        "autor": autor_nombre,
        "timestamp": iso(nota.created_at),
    }


def serialize_detalle(db: Session, case: CaseFile) -> dict:
    base = serialize_expediente(db, case)
    base["montoEstimado"] = float(case.estimated_amount)
    base["tipoOperacion"] = case.operation_type_code

    checklist = list(
        db.execute(
            select(CaseChecklistItem)
            .where(
                CaseChecklistItem.case_file_id == case.id,
                CaseChecklistItem.active_flag == 1,
            )
            .order_by(CaseChecklistItem.created_at)
        ).scalars()
    )

    docs = list(
        db.execute(
            select(Document)
            .where(
                Document.case_file_id == case.id,
                Document.active_flag == 1,
                Document.status_code != DocStatus.REPLACED,  # reemplazados van anidados
            )
            .order_by(Document.reception_at.desc())
        ).scalars()
    )

    eventos = list(
        db.execute(
            select(CaseEvent)
            .where(CaseEvent.case_file_id == case.id, CaseEvent.active_flag == 1)
            .order_by(CaseEvent.event_at.desc())
        ).scalars()
    )

    notas = list(
        db.execute(
            select(InternalNote)
            .where(
                InternalNote.case_file_id == case.id, InternalNote.active_flag == 1
            )
            .order_by(InternalNote.created_at.desc())
        ).scalars()
    )

    # Batch de los N+1 internos del detalle:
    #  - versiones anteriores de los documentos (1 query, antes 1 por doc)
    #  - autores de las notas (1 query, antes 1 por nota)
    doc_ids = [d.id for d in docs]
    prev_map: dict = {}
    if doc_ids:
        for p in db.execute(
            select(Document)
            .where(Document.replaced_by_id.in_(doc_ids))
            .order_by(Document.reception_at.desc())
        ).scalars():
            prev_map.setdefault(p.replaced_by_id, p)  # desc -> el primero es el mas reciente

    autor_ids = list({n.author_id for n in notas if n.author_id})
    autor_map: dict = {}
    if autor_ids:
        autor_map = {
            uid: name
            for uid, name in db.execute(
                select(AppUser.id, AppUser.full_name).where(AppUser.id.in_(autor_ids))
            ).all()
        }

    return {
        "expediente": base,
        "checklist": [serialize_checklist_item(i) for i in checklist],
        "documentos": [serialize_documento(db, d, prev_map=prev_map) for d in docs],
        "nextSteps": [serialize_next_step(s) for s in ns.pending_steps(db, case.id)],
        "historial": [serialize_evento(e) for e in eventos],
        "notas": [serialize_nota(db, n, autor_map=autor_map) for n in notas],
    }
