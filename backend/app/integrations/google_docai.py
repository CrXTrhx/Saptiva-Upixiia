"""Cliente de bajo nivel para Google Document AI.

Aisla todo el contacto con la API de Document AI. No tiene logica de negocio: solo
sabe clasificar (que tipo de documento es) y extraer campos de un documento.

Procesadores (se crean en la consola de Document AI y sus IDs van en el .env):
  * 1 Custom Document Classifier -> verifica el tipo del documento.
  * 1 Custom Extractor por tipo   -> extrae los campos de ese tipo.

Credenciales: service account con rol roles/documentai.apiUser. La ruta al JSON se
toma de settings.google_application_credentials (o de la env var estandar
GOOGLE_APPLICATION_CREDENTIALS si ya viene en el entorno).
"""
from __future__ import annotations

import datetime as dt
import os

from app.core.config import settings

_client_singleton = None


class DocAiError(Exception):
    """Document AI no pudo procesar la peticion (config faltante, cuota, mime, etc.)."""


def _client():
    global _client_singleton
    if _client_singleton is None:
        if settings.google_application_credentials:
            os.environ.setdefault(
                "GOOGLE_APPLICATION_CREDENTIALS",
                settings.google_application_credentials,
            )
        try:
            from google.api_core.client_options import ClientOptions
            from google.cloud import documentai
        except ImportError as exc:  # dependencia no instalada
            raise DocAiError("google-cloud-documentai no esta instalado") from exc

        opts = ClientOptions(
            api_endpoint=f"{settings.docai_location}-documentai.googleapis.com"
        )
        _client_singleton = documentai.DocumentProcessorServiceClient(
            client_options=opts
        )
    return _client_singleton


def _process(processor_id: str, content: bytes, mime_type: str | None):
    """Llama process_document y devuelve el objeto Document de la respuesta."""
    if not (settings.gcp_project_id and processor_id):
        raise DocAiError("Document AI no esta configurado (project/processor faltante)")
    from google.cloud import documentai

    client = _client()
    name = client.processor_path(
        settings.gcp_project_id, settings.docai_location, processor_id
    )
    raw = documentai.RawDocument(
        content=content, mime_type=mime_type or "application/octet-stream"
    )
    try:
        result = client.process_document(
            request=documentai.ProcessRequest(name=name, raw_document=raw)
        )
    except Exception as exc:  # errores de la API (cuota, mime, permisos, etc.)
        raise DocAiError(str(exc)) from exc
    return result.document


def classify(content: bytes, mime_type: str | None) -> tuple[str | None, float]:
    """Devuelve (etiqueta_top, confianza_0a100) del clasificador.

    El clasificador expone las etiquetas como entities; tomamos la de mayor confianza.
    """
    document = _process(settings.docai_classifier_id, content, mime_type)
    best_label: str | None = None
    best_conf = 0.0
    for ent in document.entities:
        conf = float(ent.confidence or 0.0)
        if conf >= best_conf:
            best_conf = conf
            best_label = ent.type_ or best_label
    return best_label, best_conf * 100.0


def _entity_date(ent) -> dt.date | None:
    """Extrae una fecha del normalized_value de una entity, si existe."""
    nv = getattr(ent, "normalized_value", None)
    dv = getattr(nv, "date_value", None) if nv else None
    if dv and dv.year and dv.month and dv.day:
        try:
            return dt.date(dv.year, dv.month, dv.day)
        except ValueError:
            return None
    return None


def extract_fields(
    processor_id: str, content: bytes, mime_type: str | None
) -> tuple[dict, dt.date | None, dt.date | None]:
    """Devuelve (fields, issue_date, expiry_date) del extractor del tipo dado.

    Convencion de nombres de campo (type_ de la entity) -> llaves de `fields`:
      vigencia -> expiry_date ; fecha_emision -> issue_date ; el resto va a fields.
    """
    document = _process(processor_id, content, mime_type)
    fields: dict = {}
    issue_date: dt.date | None = None
    expiry_date: dt.date | None = None

    for ent in document.entities:
        key = ent.type_
        if not key:
            continue
        date_val = _entity_date(ent)
        value = ent.mention_text or (date_val.isoformat() if date_val else "")
        if key == "vigencia":
            expiry_date = date_val
            fields["vigencia"] = value
        elif key == "fecha_emision":
            issue_date = date_val
        else:
            fields[key] = value

    return fields, issue_date, expiry_date
