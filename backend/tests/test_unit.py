"""Tests unitarios de funciones puras (sin BD)."""
from __future__ import annotations

from app.core.codes import DocType
from app.core.config import Settings
from app.integrations import anthropic_client
from app.modules.canales import codigo_extractor


# --- codigo_extractor ---

def test_extract_codigo_presente():
    assert codigo_extractor.extract_codigo("hola EXP-2026-00007 gracias") == "EXP-2026-00007"


def test_extract_codigo_case_insensitive():
    assert codigo_extractor.extract_codigo("exp-2026-00012") == "EXP-2026-00012"


def test_extract_codigo_ausente():
    assert codigo_extractor.extract_codigo("sin codigo aqui") is None
    assert codigo_extractor.extract_codigo(None) is None


def test_infer_tipo():
    assert codigo_extractor.infer_tipo("te mando mi INE") == DocType.OFFICIAL_ID
    assert codigo_extractor.infer_tipo("aqui mi comprobante") == DocType.PROOF_OF_ADDRESS
    assert codigo_extractor.infer_tipo("hola") is None


# --- normalizacion del DATABASE_URL ---

def test_sqlalchemy_url_psycopg():
    s = Settings(database_url="postgresql://u:p@host/db?sslmode=require")
    assert s.sqlalchemy_url.startswith("postgresql+psycopg://")


def test_sqlalchemy_url_postgres_alias():
    s = Settings(database_url="postgres://u:p@host/db")
    assert s.sqlalchemy_url.startswith("postgresql+psycopg://")


# --- LLM stub (reglas de umbral) ---

def test_llm_sat_si_cuando_supera_umbral():
    ans = anthropic_client.answer_compliance(
        pregunta="Hay que avisar al SAT?", tipo_operacion="Blindaje",
        monto=700000, sat_threshold=564847.65, cash_limit=376565.10,
    )
    assert ans.answer_bool is True


def test_llm_efectivo_no_cuando_supera_limite():
    ans = anthropic_client.answer_compliance(
        pregunta="Se puede pagar en efectivo?", tipo_operacion="Blindaje",
        monto=700000, sat_threshold=564847.65, cash_limit=376565.10,
    )
    assert ans.answer_bool is False


def test_llm_efectivo_si_cuando_no_supera():
    ans = anthropic_client.answer_compliance(
        pregunta="Se puede pagar en efectivo?", tipo_operacion="Blindaje",
        monto=100000, sat_threshold=564847.65, cash_limit=376565.10,
    )
    assert ans.answer_bool is True
