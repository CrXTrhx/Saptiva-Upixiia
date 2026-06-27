"""Extrae el codigo de expediente (EXP-YYYY-NNNNN) del texto de un mensaje."""
from __future__ import annotations

import re

_CODE_RE = re.compile(r"EXP-\d{4}-\d{5}", re.IGNORECASE)

# Palabras clave para inferir el tipo declarado desde el mensaje ("te mando mi INE")
_TYPE_HINTS = {
    "ine": "OFFICIAL_ID",
    "ife": "OFFICIAL_ID",
    "pasaporte": "OFFICIAL_ID",
    "identificacion": "OFFICIAL_ID",
    "curp": "CURP",
    "csf": "TAX_STATUS_CERT",
    "constancia": "TAX_STATUS_CERT",
    "fiscal": "TAX_STATUS_CERT",
    "comprobante": "PROOF_OF_ADDRESS",
    "domicilio": "PROOF_OF_ADDRESS",
}


def extract_codigo(text: str | None) -> str | None:
    if not text:
        return None
    m = _CODE_RE.search(text)
    return m.group(0).upper() if m else None


def infer_tipo(text: str | None, file_name: str | None = None) -> str | None:
    blob = f"{text or ''} {file_name or ''}".lower()
    for kw, code in _TYPE_HINTS.items():
        if kw in blob:
            return code
    return None
