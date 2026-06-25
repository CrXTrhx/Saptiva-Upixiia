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


def _make_key(file_name: str) -> str:
    return f"{uuid.uuid4().hex}_{file_name}"


def store(content: bytes, file_name: str, mime_type: str | None) -> StoredFile:
    file_name = _safe_name(file_name)
    mime_type = mime_type or "application/octet-stream"
    key = _make_key(file_name)

    if settings.storage_backend == "r2":
        _r2_client().put_object(
            Bucket=settings.r2_bucket, Key=key, Body=content, ContentType=mime_type
        )
        url = key  # se firma al leer
    else:
        _LOCAL_DIR.mkdir(parents=True, exist_ok=True)
        (_LOCAL_DIR / key).write_bytes(content)
        url = f"{settings.api_public_url.rstrip('/')}/files/{key}"

    return StoredFile(url=url, key=key, file_name=file_name, mime_type=mime_type)


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
