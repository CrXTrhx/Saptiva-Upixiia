"""Adaptador de storage de archivos.

Backend configurable (STORAGE_BACKEND):
  * local: guarda en ./storage_local y sirve via /files/<key> (dev).
  * r2: sube a Cloudflare R2 (S3-compatible). El bucket es PRIVADO; la lectura se
        hace con URLs firmadas temporales (presigned), apropiado para documentos
        de identidad. No requiere hacer el bucket publico.

`document.file_url` guarda:
  * en local: la URL completa (http://.../files/<key>)
  * en r2: la KEY del objeto (se firma al momento de leer con resolve_url()).
"""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings

_LOCAL_DIR = Path(__file__).resolve().parents[2] / "storage_local"
_SAFE = re.compile(r"[^A-Za-z0-9._-]+")
_PRESIGN_EXPIRES = 3600  # 1 hora

_client_singleton = None


@dataclass
class StoredFile:
    url: str        # lo que se guarda en document.file_url
    key: str
    file_name: str
    mime_type: str


def _r2_client():
    global _client_singleton
    if _client_singleton is None:
        import boto3
        from botocore.config import Config

        _client_singleton = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            region_name="auto",
            config=Config(signature_version="s3v4"),
        )
    return _client_singleton


def _safe_name(name: str) -> str:
    name = (name or "documento").strip().replace(" ", "_")
    name = _SAFE.sub("", name) or "documento"
    return name[:120]


def _safe_segment(value: str) -> str:
    """Sanitiza un segmento de ruta (carpeta) para usarlo como prefijo de la key."""
    value = (value or "").strip().replace(" ", "_")
    return _SAFE.sub("", value)


def _make_key(file_name: str, prefix: str | None = None, doc_type: str | None = None) -> str:
    """Construye la key del objeto en R2 (que ademas define la 'carpeta').

    En R2/S3 no hay carpetas reales: el '/' en la key es lo que el panel muestra
    como carpeta. Formato limpio `TIPO_nombre_<id6><ext>`:
      * expediente:  EXP-2026-00001/CURP_RULV061217H_4e49e8.pdf
      * huerfano:    huerfanos/recibo_luz_4e49e8.pdf  (sin tipo aun)
      * sin prefijo: documento_4e49e8.pdf

    El `id6` (6 hex) garantiza unicidad para que un reemplazo del mismo tipo NO
    sobreescriba a la version anterior (la retencion depende de eso). El tipo no
    se duplica si el nombre ya empieza con el (ej. archivo "CURP_RULV...").
    """
    folder = _safe_segment(prefix) if prefix else ""

    # Separa nombre y extension para colocar el id6 antes de la extension.
    stem, dot, ext = file_name.rpartition(".")
    if not dot:  # archivo sin extension
        stem, ext = file_name, ""
    else:
        ext = "." + ext

    tag = _safe_segment(doc_type) if doc_type else ""
    if tag and not stem.upper().startswith(tag.upper()):
        stem = f"{tag}_{stem}"

    name = f"{stem}_{uuid.uuid4().hex[:6]}{ext}"
    return f"{folder}/{name}" if folder else name


def store(
    content: bytes,
    file_name: str,
    mime_type: str | None,
    *,
    prefix: str | None = None,
    doc_type: str | None = None,
) -> StoredFile:
    """Almacena un archivo y devuelve su StoredFile.

    `prefix` define la carpeta (ej. el codigo del expediente o "huerfanos") y
    `doc_type` se antepone al nombre para identificar el tipo a simple vista. Si
    no se pasan, la key queda plana como antes (100% retrocompatible).
    """
    file_name = _safe_name(file_name)
    mime_type = mime_type or "application/octet-stream"
    key = _make_key(file_name, prefix=prefix, doc_type=doc_type)

    if settings.storage_backend == "r2":
        _r2_client().put_object(
            Bucket=settings.r2_bucket, Key=key, Body=content, ContentType=mime_type
        )
        url = key  # se firma al leer
    else:
        dest = _LOCAL_DIR / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)
        url = f"{settings.api_public_url.rstrip('/')}/files/{key}"

    return StoredFile(url=url, key=key, file_name=file_name, mime_type=mime_type)


def read(stored_value: str) -> bytes:
    """Lee de vuelta los bytes de un archivo ya almacenado (simetrico a store()).

    Acepta lo que se guarda en document.file_url:
      * local: la URL completa (.../files/<key>) -> se lee del disco.
      * r2: la KEY del objeto -> se baja con get_object.
    """
    if not stored_value:
        raise ValueError("stored_value vacio")

    if stored_value.startswith("http://") or stored_value.startswith("https://"):
        key = stored_value.rsplit("/files/", 1)[-1]
        return (_LOCAL_DIR / key).read_bytes()

    # Es una key de R2.
    obj = _r2_client().get_object(Bucket=settings.r2_bucket, Key=stored_value)
    return obj["Body"].read()


def delete(stored_value: str | None) -> None:
    """Borra el archivo almacenado (simetrico a store()).

    Acepta lo que se guarda en file_url:
      * local: la URL completa (.../files/<key>) -> borra del disco.
      * r2: la KEY del objeto -> delete_object.
    Idempotente: si el archivo ya no existe, no falla.
    """
    if not stored_value:
        return

    if stored_value.startswith("http://") or stored_value.startswith("https://"):
        key = stored_value.rsplit("/files/", 1)[-1]
        try:
            (_LOCAL_DIR / key).unlink()
        except FileNotFoundError:
            pass
        return

    # Es una key de R2. delete_object no falla si la key no existe.
    _r2_client().delete_object(Bucket=settings.r2_bucket, Key=stored_value)


def resolve_url(stored_value: str | None) -> str | None:
    """Convierte lo guardado en file_url a una URL servible por el frontend.

    - Si ya es una URL http(s) (local o publica): se devuelve tal cual.
    - Si es una KEY de R2: se devuelve una URL firmada temporal (presigned).
    """
    if not stored_value:
        return stored_value
    if stored_value.startswith("http://") or stored_value.startswith("https://"):
        return stored_value
    # Es una key de R2 -> URL firmada
    try:
        return _r2_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.r2_bucket, "Key": stored_value},
            ExpiresIn=_PRESIGN_EXPIRES,
        )
    except Exception:
        return stored_value


LOCAL_DIR = _LOCAL_DIR
