"""Endpoints de expedientes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user, get_db
from app.models import AppUser
from app.modules.expedientes import serializers, service
from app.modules.expedientes.schemas import (
    CancelarRequest,
    ConsultaLLMRequest,
    CreateExpedienteRequest,
    EditExpedienteRequest,
    NotaRequest,
)

router = APIRouter(tags=["expedientes"])


@router.post("/expedientes", status_code=201)
def crear_expediente(
    body: CreateExpedienteRequest,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    case = service.create_expediente(db, body, user)
    return serializers.serialize_expediente(db, case)


@router.get("/expedientes/conteos")
def conteos(
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    return service.conteos(db)


@router.get("/expedientes")
def listar_expedientes(
    search: str | None = Query(default=None),
    estado: str | None = Query(default=None),
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
    doc_faltante: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    cases = service.list_expedientes(
        db, search=search, estado=estado, desde=desde, hasta=hasta, doc_faltante=doc_faltante
    )
    return serializers.serialize_expedientes_bulk(db, cases)


@router.get("/expedientes/pagina")
def listar_expedientes_pagina(
    search: str | None = Query(default=None),
    estado: str | None = Query(default=None),
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
    doc_faltante: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    cases, total = service.list_expedientes_pagina(
        db,
        search=search,
        estado=estado,
        desde=desde,
        hasta=hasta,
        doc_faltante=doc_faltante,
        limit=limit,
        offset=offset,
    )
    return {
        "items": serializers.serialize_expedientes_bulk(db, cases),
        "total": total,
    }


@router.get("/expedientes/{case_id}")
def obtener_expediente(
    case_id: str,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    case = service.get_case_or_404(db, case_id)
    return serializers.serialize_expediente(db, case)


@router.patch("/expedientes/{case_id}")
def editar_expediente(
    case_id: str,
    body: EditExpedienteRequest,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    case = service.get_case_or_404(db, case_id)
    service.editar_expediente(db, case, body, user)
    return serializers.serialize_expediente(db, case)


@router.get("/expedientes/{case_id}/detalle")
def detalle_expediente(
    case_id: str,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    case = service.get_case_or_404(db, case_id)
    return serializers.serialize_detalle(db, case)


@router.get("/expedientes/{case_id}/instrucciones")
def instrucciones(
    case_id: str,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    case = service.get_case_or_404(db, case_id)
    remitente = settings.mail_from or f"noreply@{settings.mailgun_domain}" if settings.mailgun_domain else "noreply@upiixia.com"
    return {
        "codigo": case.code,
        "destinatario": case.client_email or "",
        "remitente": settings.mail_from or settings.system_email,
        "asunto": case.code,
        "whatsapp": settings.system_whatsapp,
        "correo": settings.system_email,
        "texto": service.instrucciones_texto(db, case),
    }


@router.patch("/expedientes/{case_id}/completar")
def completar(
    case_id: str,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    case = service.get_case_or_404(db, case_id)
    service.marcar_completo(db, case, user)
    return serializers.serialize_expediente(db, case)


@router.patch("/expedientes/{case_id}/archivar")
def archivar(
    case_id: str,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    case = service.get_case_or_404(db, case_id)
    service.archivar(db, case, user)
    return serializers.serialize_expediente(db, case)


@router.patch("/expedientes/{case_id}/cancelar")
def cancelar(
    case_id: str,
    body: CancelarRequest,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    case = service.get_case_or_404(db, case_id)
    service.cancelar(db, case, body.motivo, user)
    return serializers.serialize_expediente(db, case)


@router.patch("/expedientes/{case_id}/restaurar")
def restaurar(
    case_id: str,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    case = service.get_case_or_404(db, case_id)
    service.restaurar(db, case, user)
    return serializers.serialize_expediente(db, case)


@router.post("/expedientes/{case_id}/reenviar-instrucciones")

def reenviar_instrucciones(
    case_id: str,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    case = service.get_case_or_404(db, case_id)
    return service.reenviar_instrucciones(db, case, user)


@router.post("/expedientes/{case_id}/notas", status_code=201)
def agregar_nota(
    case_id: str,
    body: NotaRequest,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    case = service.get_case_or_404(db, case_id)
    nota = service.agregar_nota(db, case, body.texto, user)
    return serializers.serialize_nota(db, nota)


@router.post("/expedientes/{case_id}/consulta-llm")
def consulta_llm(
    case_id: str,
    body: ConsultaLLMRequest,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    from app.modules.llm import service as llm_service

    case = service.get_case_or_404(db, case_id)
    return llm_service.consultar(db, case, body.pregunta, user)
