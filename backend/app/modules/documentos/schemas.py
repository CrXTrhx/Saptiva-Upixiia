"""Schemas de request del modulo documentos."""
from __future__ import annotations

from pydantic import Field

from app.schemas.base import CamelModel


class RechazarRequest(CamelModel):
    categoria: str = Field(default="OTHER")  # ILLEGIBLE | TYPE_MISMATCH | EXPIRED | OTHER
    texto: str = Field(min_length=1)
