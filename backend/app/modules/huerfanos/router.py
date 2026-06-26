"""Endpoints de la cola de documentos huerfanos."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models import AppUser
from app.modules.expedientes import serializers as exp_serializers
from app.modules.expedientes import service as exp_service
from app.modules.expedientes.schemas import CreateExpedienteRequest
from app.modules.huerfanos import service
from app.modules.huerfanos.schemas import (
    AsignarRequest,
    CrearExpedienteRequest,
    DescartarRequest,
)

router = APIRouter(tags=["huerfanos"])


@router.get("/huerfanos/count")
def count(
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    return {"count": service.count_pending(db)}


@router.get("/huerfanos")
def listar(
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    return [service.serialize_orphan(db, o) for o in service.list_pending(db)]


@router.post("/huerfanos/{orphan_id}/asignar", status_code=201)
def asignar(
    orphan_id: str,
    body: AsignarRequest,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    orphan = service.get_orphan_or_404(db, orphan_id)
    case = exp_service.get_case_or_404(db, body.expediente_id)
    doc = service.asignar(db, orphan, case, body.tipo, user)
    return exp_serializers.serialize_documento(db, doc)


@router.post("/huerfanos/{orphan_id}/crear-expediente", status_code=201)
def crear_expediente(
    orphan_id: str,
    body: CrearExpedienteRequest,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    orphan = service.get_orphan_or_404(db, orphan_id)
    req = CreateExpedienteRequest(
        clienteNombre=body.cliente_nombre,
        clienteTelefono=body.cliente_telefono or "0000000000",
        clienteCorreo=body.cliente_correo or "sin-correo@centur.local",
        clienteRfc=None,
        montoEstimado=body.monto_estimado or 1,
        tipoOperacion=body.tipo_operacion,
    )
    case = exp_service.create_expediente(db, req, user)
    service.asignar(db, orphan, case, orphan.suggested_document_type_code, user)
    return exp_serializers.serialize_expediente(db, case)


@router.post("/huerfanos/{orphan_id}/descartar", status_code=204)
def descartar(
    orphan_id: str,
    body: DescartarRequest,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    orphan = service.get_orphan_or_404(db, orphan_id)
    service.descartar(db, orphan, body.motivo, user)
