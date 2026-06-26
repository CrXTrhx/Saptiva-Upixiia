"""Servicio LLM: botones '?Avisar al SAT?' y '?Pagar en efectivo?'."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.codes import EventType, LlmQuestionType
from app.integrations import anthropic_client
from app.models import AppUser, CaseFile, LlmQuery
from app.modules.eventos import registrar_evento
from app.modules.llm.umbrales import get_umbrales


def _question_type(pregunta: str) -> str:
    q = pregunta.lower()
    if "sat" in q or "avisar" in q:
        return LlmQuestionType.SAT_REPORT
    return LlmQuestionType.CASH_PAYMENT


def consultar(db: Session, case: CaseFile, pregunta: str, user: AppUser) -> dict:
    umbrales = get_umbrales(db, case.operation_type_code)
    monto = float(case.estimated_amount)

    ans = anthropic_client.answer_compliance(
        pregunta=pregunta,
        tipo_operacion=umbrales.label,
        monto=monto,
        sat_threshold=umbrales.sat_report,
        cash_limit=umbrales.cash_limit,
    )

    q_type = _question_type(pregunta)
    row = LlmQuery(
        case_file_id=case.id,
        question_type_code=q_type,
        question_text=pregunta,
        answer_bool=ans.answer_bool,
        answer_reason=ans.reason,
        amount_at_query=monto,
        operation_type_code=case.operation_type_code,
        raw_response={"reason": ans.reason, "answer": ans.answer_bool},
    )
    db.add(row)
    db.flush()

    registrar_evento(
        db, case.id, EventType.LLM_QUERY,
        f"Consulta LLM: {pregunta} -> {'SI' if ans.answer_bool else 'NO'}",
        actor=user.email, actor_user_id=user.id,
    )

    return {
        "id": str(row.id),
        "pregunta": pregunta,
        "respuesta": "si" if ans.answer_bool else "no",
        "razon": ans.reason,
        "disclaimer": ans.disclaimer,
    }
