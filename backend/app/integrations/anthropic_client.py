"""Cliente LLM (Anthropic) — STUB basado en reglas de umbral.

Con LLM_USE_REAL=false (default) responde de forma determinista aplicando los
umbrales LFPIORPI. La integracion real con Anthropic se conecta despues detras de
la misma firma.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.core.config import settings

DISCLAIMER = "Respuesta orientativa. Decision final del Representante de Cumplimiento."


@dataclass
class LlmAnswer:
    answer_bool: bool
    reason: str
    disclaimer: str = DISCLAIMER


def answer_compliance(
    *,
    pregunta: str,
    tipo_operacion: str,
    monto: float,
    sat_threshold: float,
    cash_limit: float,
) -> LlmAnswer:
    if settings.llm_use_real and settings.anthropic_api_key:
        return _answer_real(pregunta, tipo_operacion, monto, sat_threshold, cash_limit)

    q = pregunta.lower()
    if "sat" in q or "avisar" in q:
        si = monto > sat_threshold
        reason = (
            f"El monto de ${monto:,.2f} {'supera' if si else 'no supera'} el umbral de "
            f"aviso al SAT de ${sat_threshold:,.2f} para {tipo_operacion}."
        )
        return LlmAnswer(si, reason)

    # Pago en efectivo
    no = monto > cash_limit
    reason = (
        f"El monto de ${monto:,.2f} {'supera' if no else 'no supera'} el limite de "
        f"efectivo del Art. 32 de ${cash_limit:,.2f}."
    )
    return LlmAnswer(answer_bool=not no, reason=reason)


def _answer_real(pregunta, tipo_operacion, monto, sat_threshold, cash_limit) -> LlmAnswer:
    import anthropic

    prompt = (
        "Eres asesor de cumplimiento PLD bajo la LFPIORPI de Mexico. Datos:\n"
        f"- Tipo de operacion: {tipo_operacion}\n"
        f"- Monto: {monto} MXN\n"
        f"- Pregunta: {pregunta}\n\n"
        f"Umbral aviso SAT: {sat_threshold}. Limite efectivo Art.32: {cash_limit}.\n"
        "Responde en maximo 30 palabras: si o no, con la razon.\n"
        f'Cierra con: "{DISCLAIMER}"'
    )
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    msg = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=200,
        messages=[{"role": "user", "content": prompt}],
    )
    text = msg.content[0].text.strip()
    si = text.lower().lstrip().startswith(("si", "sí", "yes"))
    return LlmAnswer(answer_bool=si, reason=text)
