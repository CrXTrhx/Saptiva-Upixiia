"""Resumen del dashboard: conteos por estado + huerfanos pendientes en UNA request.

Antes el frontend hacia 2 llamadas separadas (/expedientes/conteos y /huerfanos/count)
en la carga inicial. Ambas son globales (no dependen de los filtros), asi que se
combinan aqui en un solo round-trip. Reutiliza las funciones existentes; no cambia
ningun calculo.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models import AppUser
from app.modules.expedientes import service as exp_service
from app.modules.huerfanos import service as huerfanos_service

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/resumen")
def resumen(
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    return {
        "conteos": exp_service.conteos(db),
        "huerfanosPendientes": huerfanos_service.count_pending(db),
    }
