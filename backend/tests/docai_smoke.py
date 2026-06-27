"""Diagnostico de Google Document AI (clasificador + extractores).

Prueba la conexion real contra Document AI usando un archivo de sample_docs/ (o el
que le pases). NO toca la base de datos. Util para verificar que los procesadores
estan creados, desplegados y configurados en el .env.

Uso:
    python -m tests.docai_smoke                         # usa ine_juan.jpg
    python -m tests.docai_smoke sample_docs/curp_juan.pdf
    python -m tests.docai_smoke /ruta/a/mi_documento.pdf
"""
from __future__ import annotations

import mimetypes
import pathlib
import sys

from app.core.config import settings
from app.integrations import document_api, google_docai

HERE = pathlib.Path(__file__).resolve().parents[1]


def _check_config() -> bool:
    print("== Configuracion ==")
    ok = True
    print(f"  GCP_PROJECT_ID            = {settings.gcp_project_id or '(vacio!)'}")
    print(f"  DOCAI_LOCATION            = {settings.docai_location}")
    for label, val in [
        ("DOCAI_CLASSIFIER_ID", settings.docai_classifier_id),
        ("DOCAI_EXTRACTOR_OFFICIAL_ID", settings.docai_extractor_official_id),
        ("DOCAI_EXTRACTOR_CURP", settings.docai_extractor_curp),
        ("DOCAI_EXTRACTOR_TAX_STATUS", settings.docai_extractor_tax_status),
        ("DOCAI_EXTRACTOR_PROOF_ADDRESS", settings.docai_extractor_proof_address),
    ]:
        mark = "ok " if val else "FALTA"
        if not val:
            ok = False
        print(f"  [{mark}] {label}")
    cred = settings.google_application_credentials
    cred_ok = bool(cred) and pathlib.Path(cred).is_file()
    print(f"  [{'ok ' if cred_ok else 'FALTA'}] GOOGLE_APPLICATION_CREDENTIALS")
    print()
    return ok and cred_ok


def main() -> int:
    arg = sys.argv[1] if len(sys.argv) > 1 else "sample_docs/ine_juan.jpg"
    path = pathlib.Path(arg)
    if not path.is_absolute():
        path = HERE / arg
    if not path.is_file():
        print(f"XX No existe el archivo: {path}")
        return 2

    if not _check_config():
        print("XX Falta configuracion en el .env (ver arriba). Aborto.")
        return 2

    content = path.read_bytes()
    mime = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    print(f"== Documento: {path.name} ({mime}, {len(content)} bytes) ==\n")

    # 1) Clasificador (mostrando TODAS las etiquetas crudas que devuelve)
    print("== Paso 1: clasificador ==")
    try:
        doc = google_docai._process(settings.docai_classifier_id, content, mime)
        ents = sorted(doc.entities, key=lambda e: -(e.confidence or 0))
        if not ents:
            print("  (el clasificador no devolvio ninguna etiqueta)")
        for e in ents:
            print(f"    - {e.type_!r}: {float(e.confidence or 0) * 100:.1f}%")
        label, conf = google_docai.classify(content, mime)
        print(f"  -> tipo detectado (top): {label}   confianza: {conf:.1f}%\n")
    except google_docai.DocAiError as exc:
        print(f"  XX Error del clasificador: {exc}\n")
        _hint(exc)
        return 1

    # 2) Orquestacion completa (clasifica + extrae) = lo que usa el pipeline real
    print("== Paso 2: extraccion completa (document_api.extract) ==")
    try:
        res = document_api.extract(content, mime, None, path.name)
    except document_api.DocumentApiError as exc:
        print(f"  XX Error de extraccion: {exc}\n")
        _hint(exc)
        return 1

    print(f"  detected_type = {res.detected_type}")
    print(f"  confidence    = {res.confidence:.1f}%")
    print(f"  issue_date    = {res.issue_date}")
    print(f"  expiry_date   = {res.expiry_date}")
    print(f"  fields        = {res.fields}")
    print("\nOK: Document AI respondio correctamente.")
    return 0


def _hint(exc: Exception) -> None:
    msg = str(exc).lower()
    if "not found" in msg or "404" in msg or "does not exist" in msg:
        print("  Pista: revisa el Processor ID / location, o que el procesador exista.")
    if "version" in msg or "no default" in msg or "deploy" in msg:
        print("  Pista: el procesador no tiene una VERSION desplegada/por-defecto.")
        print("         Entrena y DESPLIEGA una version, y fijala como default.")
    if "permission" in msg or "403" in msg or "denied" in msg:
        print("  Pista: el service account necesita el rol roles/documentai.apiUser.")


if __name__ == "__main__":
    raise SystemExit(main())
