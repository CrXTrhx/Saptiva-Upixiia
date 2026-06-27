"""Tests unitarios de funciones puras (sin BD)."""
from __future__ import annotations

import datetime as dt
from types import SimpleNamespace

from app.core.codes import DocType
from app.core.config import Settings
from app.integrations import anthropic_client, google_docai
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


# --- google_docai: mapeo de entities -> fields (sin red) ---

def _entity(type_, mention="", date=None, confidence=0.9):
    nv = None
    if date is not None:
        nv = SimpleNamespace(
            date_value=SimpleNamespace(year=date.year, month=date.month, day=date.day)
        )
    return SimpleNamespace(
        type_=type_, mention_text=mention, normalized_value=nv, confidence=confidence
    )


def test_extract_fields_mapea_campos_y_fechas(monkeypatch):
    """vigencia -> expiry_date, fecha_emision -> issue_date, resto -> fields."""
    entities = [
        _entity("curp", "PEPJ900101HDFRRN09"),
        _entity("nombre", "Juan Perez"),
        _entity("vigencia", date=dt.date(2030, 12, 31)),
        _entity("fecha_emision", date=dt.date(2024, 1, 15)),
    ]
    monkeypatch.setattr(
        google_docai, "_process", lambda *a, **k: SimpleNamespace(entities=entities)
    )

    fields, issue, expiry = google_docai.extract_fields("proc", b"x", "image/jpeg")

    assert fields["curp"] == "PEPJ900101HDFRRN09"
    assert fields["nombre"] == "Juan Perez"
    assert "fecha_emision" not in fields  # se mapea a issue_date, no a fields
    assert issue == dt.date(2024, 1, 15)
    assert expiry == dt.date(2030, 12, 31)


def test_classify_devuelve_label_top(monkeypatch):
    entities = [
        _entity(DocType.CURP, confidence=0.40),
        _entity(DocType.OFFICIAL_ID, confidence=0.92),
    ]
    monkeypatch.setattr(
        google_docai, "_process", lambda *a, **k: SimpleNamespace(entities=entities)
    )
    label, conf = google_docai.classify(b"x", "image/jpeg")
    assert label == DocType.OFFICIAL_ID
    assert round(conf, 1) == 92.0
