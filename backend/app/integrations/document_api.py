"""Cliente de la Document API (adjudicator.saptiva.com) — STUB.

La integracion real se conecta despues. El stub produce extracciones plausibles y
permite simular los casos del PRD para la demo:
  * archivo con 'ilegible'/'borroso' en el nombre -> confianza baja (se rechaza).
  * archivo con 'error'/'fail'/'corrupto' -> la API "no puede procesar" (raise).
  * el tipo detectado se infiere del nombre si difiere del declarado.

Contrato de salida (lo consume el pipeline):
  { detected_type, confidence, issue_date, expiry_date?, fields }
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

from app.core.codes import DocType


class DocumentApiError(Exception):
    """La Document API no pudo procesar el documento."""


@dataclass
class ExtractionResult:
    detected_type: str | None
    confidence: float
    issue_date: dt.date | None = None
    expiry_date: dt.date | None = None
    fields: dict = field(default_factory=dict)


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


def extract(
    file_name: str, mime_type: str | None, declared_type: str | None
) -> ExtractionResult:
    name = (file_name or "").lower()

    if any(k in name for k in _FAIL_KEYWORDS):
        raise DocumentApiError("El documento no pudo ser procesado")

    detected = declared_type
    for kw, code in _TYPE_KEYWORDS.items():
        if kw in name:
            detected = code
            break

    confidence = 50.0 if any(k in name for k in _LOW_QUALITY) else 95.0
    today = dt.date.today()
    issue_date: dt.date | None = None
    expiry_date: dt.date | None = None
    fields: dict = {"nombre": "Juan Perez (demo)"}

    if detected == DocType.PROOF_OF_ADDRESS:
        # 'vencido' -> emitido hace 4 meses (excede 3); si no, hace 10 dias.
        issue_date = today - dt.timedelta(days=120 if "vencido" in name else 10)
        fields["domicilio"] = "Calle Falsa 123, CDMX"
        fields["codigo_postal"] = "01000"
    elif detected == DocType.OFFICIAL_ID:
        issue_date = today - dt.timedelta(days=365)
        expiry_date = today - dt.timedelta(days=5) if "vencido" in name else today + dt.timedelta(days=900)
        fields["curp"] = "PEPJ900101HDFRRN09"
        fields["vigencia"] = expiry_date.isoformat()
    elif detected == DocType.CURP:
        fields["curp"] = "PEPJ900101HDFRRN09"
    elif detected == DocType.TAX_STATUS_CERT:
        issue_date = today - dt.timedelta(days=400 if "vencido" in name else 20)
        fields["rfc"] = "PEPJ900101AB1"

    return ExtractionResult(
        detected_type=detected,
        confidence=confidence,
        issue_date=issue_date,
        expiry_date=expiry_date,
        fields=fields,
    )
