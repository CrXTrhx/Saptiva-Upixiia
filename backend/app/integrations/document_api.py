"""Extraccion/clasificacion de documentos con Google Document AI.

Orquesta los procesadores de Document AI (ver app/integrations/google_docai.py):
  1) Clasificador  -> verifica de que tipo es el documento (y con que confianza).
  2) Extractor por tipo -> extrae los campos del tipo detectado.

Contrato de salida (lo consume el pipeline en modules/pipeline/steps.py):
  ExtractionResult(detected_type, confidence, issue_date, expiry_date, fields)

Si Document AI no puede procesar el documento (config faltante, cuota, mime no
soportado, etc.) se levanta DocumentApiError; el pipeline lo traduce a un rechazo
automatico ILLEGIBLE.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

from app.core.codes import DocType
from app.core.config import settings
from app.integrations import google_docai


class DocumentApiError(Exception):
    """La extraccion de documentos no pudo procesar el documento."""


@dataclass
class ExtractionResult:
    detected_type: str | None
    confidence: float
    issue_date: dt.date | None = None
    expiry_date: dt.date | None = None
    fields: dict = field(default_factory=dict)


# Etiqueta del clasificador -> codigo interno de tipo (codigos = etiquetas recomendadas).
_LABEL_TO_DOCTYPE = {
    DocType.OFFICIAL_ID: DocType.OFFICIAL_ID,
    DocType.CURP: DocType.CURP,
    DocType.TAX_STATUS_CERT: DocType.TAX_STATUS_CERT,
    DocType.PROOF_OF_ADDRESS: DocType.PROOF_OF_ADDRESS,
    DocType.OTHER: DocType.OTHER,
}


def _extractor_for(doc_type: str | None) -> str:
    return {
        DocType.OFFICIAL_ID: settings.docai_extractor_official_id,
        DocType.CURP: settings.docai_extractor_curp,
        DocType.TAX_STATUS_CERT: settings.docai_extractor_tax_status,
        DocType.PROOF_OF_ADDRESS: settings.docai_extractor_proof_address,
    }.get(doc_type or "", "")


def extract(
    content: bytes,
    mime_type: str | None,
    declared_type: str | None,
    file_name: str | None = None,
) -> ExtractionResult:
    """Clasifica y extrae un documento con Google Document AI.

    `file_name` es opcional (Document AI trabaja sobre los bytes); se mantiene para
    trazabilidad y para permitir fakes deterministas en pruebas.
    """
    if not content:
        raise DocumentApiError("El documento esta vacio")

    try:
        label, confidence = google_docai.classify(content, mime_type)
    except google_docai.DocAiError as exc:
        raise DocumentApiError(f"No se pudo clasificar el documento: {exc}") from exc

    detected = _LABEL_TO_DOCTYPE.get(label, label or declared_type)

    fields: dict = {}
    issue_date: dt.date | None = None
    expiry_date: dt.date | None = None

    processor_id = _extractor_for(detected)
    if processor_id:
        try:
            fields, issue_date, expiry_date = google_docai.extract_fields(
                processor_id, content, mime_type
            )
        except google_docai.DocAiError as exc:
            raise DocumentApiError(
                f"No se pudieron extraer los datos del documento: {exc}"
            ) from exc

    return ExtractionResult(
        detected_type=detected,
        confidence=confidence,
        issue_date=issue_date,
        expiry_date=expiry_date,
        fields=fields,
    )
