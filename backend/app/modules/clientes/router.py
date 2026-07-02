"""Endpoints de clientes (agrupacion de expedientes por RFC)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models import AppUser
from app.modules.clientes import service
from app.modules.expedientes import serializers

router = APIRouter(tags=["clientes"])


@router.get("/clientes")
def listar_clientes(
    search: str | None = Query(default=None),
    estado: str | None = Query(default=None),
    desde: str | None = Query(default=None),
    hasta: str | None = Query(default=None),
    doc_faltante: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """Lista compacta de clientes (uno por RFC) con sus agregados."""
    return service.list_clientes(
        db, search=search, estado=estado, desde=desde, hasta=hasta, doc_faltante=doc_faltante
    )


@router.get("/clientes/sugerencias")
def sugerencias_rfc(
    rfc: str = Query(default=""),
    limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """Autocompletado de RFC: clientes existentes cuyo RFC empieza con el prefijo."""
    return service.sugerencias_rfc(db, rfc, limit=limit)


@router.get("/clientes/{clave}/expedientes")
def expedientes_de_cliente(
    clave: str,
    archivados: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    """Expedientes de un cliente (carga diferida al hacer clic en el dashboard).

    Por defecto NO incluye archivados; `?archivados=true` devuelve solo los archivados
    (la seccion "Archivados" del detalle los pide asi, al expandirse)."""
    cases = service.expedientes_de_cliente(db, clave, solo_archivados=archivados)
    return serializers.serialize_expedientes_bulk(db, cases)
