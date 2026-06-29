"""Schemas de request del modulo expedientes (camelCase desde el frontend)."""
from __future__ import annotations

import re

from pydantic import EmailStr, Field, field_validator

from app.core.codes import OperationType
from app.schemas.base import CamelModel

# RFC mexicano (persona fisica 13 / moral 12). Es la identidad del cliente: con el
# se relacionan los expedientes, por eso ahora es OBLIGATORIO al crear.
_RFC_RE = re.compile(r"^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$")

# Tipos REALES seleccionables por linea de operacion (MIXED es solo el resumen).
_TIPOS_VALIDOS = {OperationType.ARMORING, OperationType.VEHICLE_SALE}


def _operation_code(value: str) -> str:
    """Normaliza el tipo recibido del frontend al codigo canonico del catalogo."""
    mapping = {
        "blindaje": OperationType.ARMORING,
        "venta_vehiculo": OperationType.VEHICLE_SALE,
        "armoring": OperationType.ARMORING,
        "vehicle_sale": OperationType.VEHICLE_SALE,
    }
    key = (value or "").strip()
    return mapping.get(key.lower(), key.upper())


class OperacionItem(CamelModel):
    """Una operacion de la venta: tipo + monto. Se captura una por una (3 blindajes =
    3 items), cada una con su propio monto."""
    tipo: str  # ARMORING | VEHICLE_SALE
    monto: float = Field(gt=0)

    @field_validator("tipo")
    @classmethod
    def _normaliza_tipo(cls, v: str) -> str:
        code = _operation_code(v)
        if code not in _TIPOS_VALIDOS:
            raise ValueError("Tipo de operacion invalido")
        return code


def _resumen_tipo(operaciones: list[OperacionItem]) -> str:
    """Tipo de resumen del expediente: el tipo unico, o MIXED si hay varios."""
    tipos = {op.tipo for op in operaciones}
    return next(iter(tipos)) if len(tipos) == 1 else OperationType.MIXED


class CreateExpedienteRequest(CamelModel):
    cliente_nombre: str = Field(min_length=2, max_length=255)
    cliente_telefono: str = Field(min_length=5, max_length=30)
    cliente_correo: EmailStr
    cliente_rfc: str = Field(min_length=12, max_length=13)
    operaciones: list[OperacionItem] = Field(min_length=1)

    @field_validator("cliente_rfc")
    @classmethod
    def _normaliza_rfc(cls, v: str) -> str:
        v = (v or "").strip().upper()
        if not _RFC_RE.match(v):
            raise ValueError("RFC invalido")
        return v

    def operation_type_code(self) -> str:
        """Resumen: tipo unico, o MIXED si la venta mezcla tipos."""
        return _resumen_tipo(self.operaciones)

    def total(self) -> float:
        """Monto total del expediente = suma de las lineas."""
        return float(sum(op.monto for op in self.operaciones))


class EditExpedienteRequest(CamelModel):
    """Edicion de datos del cliente/operaciones (Flujo C). Todos opcionales."""
    cliente_nombre: str | None = Field(default=None, min_length=2, max_length=255)
    cliente_telefono: str | None = Field(default=None, max_length=30)
    cliente_correo: EmailStr | None = None
    cliente_rfc: str | None = Field(default=None, max_length=13)
    # Si viene, reemplaza la lista completa de operaciones del expediente.
    operaciones: list[OperacionItem] | None = Field(default=None, min_length=1)

    def operation_type_code(self) -> str | None:
        if not self.operaciones:
            return None
        return _resumen_tipo(self.operaciones)

    def total(self) -> float | None:
        if not self.operaciones:
            return None
        return float(sum(op.monto for op in self.operaciones))


class CancelarRequest(CamelModel):
    motivo: str = Field(min_length=3)


class NotaRequest(CamelModel):
    texto: str = Field(min_length=1)


class ConsultaLLMRequest(CamelModel):
    pregunta: str = Field(min_length=2)
