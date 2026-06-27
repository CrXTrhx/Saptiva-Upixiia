"""Schemas de request del modulo huerfanos."""
from __future__ import annotations

from pydantic import Field

from app.schemas.base import CamelModel


class AsignarRequest(CamelModel):
    expediente_id: str
    tipo: str | None = None  # tipo de documento declarado al asignar


class CrearExpedienteRequest(CamelModel):
    cliente_nombre: str = Field(min_length=2)
    cliente_telefono: str = Field(default="", max_length=30)
    cliente_correo: str = Field(default="")
    monto_estimado: float = Field(default=0, ge=0)
    tipo_operacion: str = Field(default="ARMORING")


class DescartarRequest(CamelModel):
    motivo: str = Field(min_length=2)
