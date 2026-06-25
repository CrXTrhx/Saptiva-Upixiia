"""Catalogos: expone codigos (ingles) + label_es para que el frontend muestre texto.

Un solo GET evita que el frontend hardcodee etiquetas. Solo lectura.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.models import AppUser

router = APIRouter(tags=["catalogos"])


# Catalogos que tienen columna sort_order (los demas se ordenan por label_es)
_HAS_SORT = {
    "cat_case_status",
    "cat_document_type",
    "cat_document_status",
    "cat_checklist_status",
    "cat_next_step_priority",
}


def _simple(db: Session, table: str) -> list[dict]:
    order_by = "sort_order, label_es" if table in _HAS_SORT else "label_es"
    rows = db.execute(
        text(f"SELECT code, label_es FROM {table} WHERE active_flag = 1 ORDER BY {order_by}")
    ).all()
    return [{"code": code, "label": label} for code, label in rows]


@router.get("/catalogos")
def catalogos(
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    ops = db.execute(
        text(
            "SELECT code, label_es, lfpiorpi_fraction, identification_threshold, "
            "sat_report_threshold, cash_limit_threshold FROM cat_operation_type "
            "WHERE active_flag = 1 ORDER BY sort_order"
        )
    ).all()
    tipos_operacion = [
        {
            "code": r[0],
            "label": r[1],
            "fraccion": r[2],
            "identificacion": float(r[3]),
            "avisoSat": float(r[4]),
            "efectivo": float(r[5]),
        }
        for r in ops
    ]

    return {
        "estados": _simple(db, "cat_case_status"),
        "tiposOperacion": tipos_operacion,
        "tiposDocumento": _simple(db, "cat_document_type"),
        "estadosDocumento": _simple(db, "cat_document_status"),
        "estadosChecklist": _simple(db, "cat_checklist_status"),
        "canales": _simple(db, "cat_channel"),
        "motivosRechazo": _simple(db, "cat_rejection_reason"),
        "prioridades": _simple(db, "cat_next_step_priority"),
        "estadosHuerfano": _simple(db, "cat_orphan_status"),
    }
