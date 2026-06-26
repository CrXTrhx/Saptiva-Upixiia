"""Configuracion de pytest.

La extraccion real usa Google Document AI (red + credenciales). En las pruebas la
reemplazamos por un fake determinista basado en el nombre del archivo, que reproduce
los escenarios del PRD sin tocar GCP:
  * nombre con 'ilegible'/'borroso'  -> confianza baja (se rechaza por ILLEGIBLE).
  * nombre con 'error'/'fail'/...     -> Document AI "no puede procesar" (raise).
  * el tipo detectado se infiere del nombre (verifica TYPE_MISMATCH).
"""
from __future__ import annotations

import datetime as dt

import pytest

from app.core.codes import DocType
from app.integrations import document_api

_TYPE_KEYWORDS = {
    "ine": DocType.OFFICIAL_ID,
    "ife": DocType.OFFICIAL_ID,
    "pasaporte": DocType.OFFICIAL_ID,
    "curp": DocType.CURP,
    "csf": DocType.TAX_STATUS_CERT,
    "constancia": DocType.TAX_STATUS_CERT,
    "fiscal": DocType.TAX_STATUS_CERT,
    "comprobante": DocType.PROOF_OF_ADDRESS,
    "domicilio": DocType.PROOF_OF_ADDRESS,
    "recibo": DocType.PROOF_OF_ADDRESS,
}
_FAIL_KEYWORDS = ("error", "fail", "corrupto", "corrupt", "noproc")
_LOW_QUALITY = ("ilegible", "borroso", "blurry", "lowq")


def _fake_extract(content, mime_type, declared_type, file_name=None):
    name = (file_name or "").lower()
    if any(k in name for k in _FAIL_KEYWORDS):
        raise document_api.DocumentApiError("El documento no pudo ser procesado")

    detected = declared_type
    for kw, code in _TYPE_KEYWORDS.items():
        if kw in name:
            detected = code
            break

    confidence = 50.0 if any(k in name for k in _LOW_QUALITY) else 95.0
    today = dt.date.today()
    issue_date = expiry_date = None
    fields: dict = {"nombre": "Juan Perez (demo)"}

    if detected == DocType.PROOF_OF_ADDRESS:
        issue_date = today - dt.timedelta(days=120 if "vencido" in name else 10)
        fields["domicilio"] = "Calle Falsa 123, CDMX"
        fields["codigo_postal"] = "01000"
    elif detected == DocType.OFFICIAL_ID:
        issue_date = today - dt.timedelta(days=365)
        expiry_date = (
            today - dt.timedelta(days=5)
            if "vencido" in name
            else today + dt.timedelta(days=900)
        )
        fields["curp"] = "PEPJ900101HDFRRN09"
        fields["vigencia"] = expiry_date.isoformat()
    elif detected == DocType.CURP:
        fields["curp"] = "PEPJ900101HDFRRN09"
    elif detected == DocType.TAX_STATUS_CERT:
        issue_date = today - dt.timedelta(days=400 if "vencido" in name else 20)
        fields["rfc"] = "PEPJ900101AB1"

    return document_api.ExtractionResult(
        detected_type=detected,
        confidence=confidence,
        issue_date=issue_date,
        expiry_date=expiry_date,
        fields=fields,
    )


@pytest.fixture(autouse=True, scope="session")
def _mock_document_ai():
    original = document_api.extract
    document_api.extract = _fake_extract
    yield
    document_api.extract = original
