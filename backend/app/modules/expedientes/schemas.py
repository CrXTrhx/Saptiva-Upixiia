"""Schemas de request del modulo expedientes (camelCase desde el frontend)."""
from __future__ import annotations

from pydantic import EmailStr, Field

from app.core.codes import OperationType
from app.schemas.base import CamelModel


class CreateExpedienteRequest(CamelModel):
    cliente_nombre: str = Field(min_length=2, max_length=255)
    cliente_telefono: str = Field(min_length=5, max_length=30)
    cliente_correo: EmailStr
    cliente_rfc: str | None = Field(default=None, max_length=13)
    monto_estimado: float = Field(gt=0)
    tipo_operacion: str  # ARMORING | VEHICLE_SALE

    def operation_type_code(self) -> str:
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
