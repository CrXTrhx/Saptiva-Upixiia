"""Schemas de request del modulo expedientes (camelCase desde el frontend)."""
from __future__ import annotations

import re

from pydantic import EmailStr, Field, field_validator

from app.core.codes import OperationType
from app.schemas.base import CamelModel

# RFC mexicano (persona fisica 13 / moral 12). Es la identidad del cliente: con el
# se relacionan los expedientes, por eso ahora es OBLIGATORIO al crear.
_RFC_RE = re.compile(r"^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$")


class CreateExpedienteRequest(CamelModel):
    cliente_nombre: str = Field(min_length=2, max_length=255)
    cliente_telefono: str = Field(min_length=5, max_length=30)
    cliente_correo: EmailStr
    cliente_rfc: str = Field(min_length=12, max_length=13)
    monto_estimado: float = Field(gt=0)
    tipo_operacion: str  # ARMORING | VEHICLE_SALE

    @field_validator("cliente_rfc")
    @classmethod
    def _normaliza_rfc(cls, v: str) -> str:
        v = (v or "").strip().upper()
        if not _RFC_RE.match(v):
            raise ValueError("RFC invalido")
        return v

    def operation_type_code(self) -> str:
        mapping = {
            "blindaje": OperationType.ARMORING,
            "venta_vehiculo": OperationType.VEHICLE_SALE,
            "armoring": OperationType.ARMORING,
            "vehicle_sale": OperationType.VEHICLE_SALE,
        }
        key = self.tipo_operacion.strip()
        return mapping.get(key.lower(), key.upper())


class EditExpedienteRequest(CamelModel):
    """Edicion de datos del cliente/operacion (Flujo C). Todos opcionales."""
    cliente_nombre: str | None = Field(default=None, min_length=2, max_length=255)
    cliente_telefono: str | None = Field(default=None, max_length=30)
    cliente_correo: EmailStr | None = None
    cliente_rfc: str | None = Field(default=None, max_length=13)
    monto_estimado: float | None = Field(default=None, gt=0)
    tipo_operacion: str | None = None

    def operation_type_code(self) -> str | None:
        if not self.tipo_operacion:
            return None
        mapping = {
            "blindaje": OperationType.ARMORING,
            "venta_vehiculo": OperationType.VEHICLE_SALE,
            "armoring": OperationType.ARMORING,
            "vehicle_sale": OperationType.VEHICLE_SALE,
        }
        key = self.tipo_operacion.strip()
        return mapping.get(key.lower(), key.upper())


class CancelarRequest(CamelModel):
    motivo: str = Field(min_length=3)


class NotaRequest(CamelModel):
    texto: str = Field(min_length=1)


class ConsultaLLMRequest(CamelModel):
    pregunta: str = Field(min_length=2)
