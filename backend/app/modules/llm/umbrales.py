"""Umbrales LFPIORPI por tipo de operacion (leidos del catalogo cat_operation_type)."""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models import CatOperationType


@dataclass
class Umbrales:
    identification: float
    sat_report: float
    cash_limit: float
    label: str


def get_umbrales(db: Session, operation_type_code: str) -> Umbrales:
    cat = db.get(CatOperationType, operation_type_code)
    if cat is None:
        raise NotFoundError(f"Tipo de operacion desconocido: {operation_type_code}")
    return Umbrales(
        identification=float(cat.identification_threshold),
        sat_report=float(cat.sat_report_threshold),
        cash_limit=float(cat.cash_limit_threshold),
        label=cat.label_es,
    )
