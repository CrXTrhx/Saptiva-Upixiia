"""Adaptador de storage de archivos.

Backend configurable:
  * local: guarda en ./storage_local y sirve via /files/<key> (dev).
  * r2: sube a Cloudflare R2 (S3-compatible) y devuelve URL publica.

`document.file_url` guarda la URL resultante (los bytes NO van en la BD).
"""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings

_LOCAL_DIR = Path(__file__).resolve().parents[2] / "storage_local"
_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


@dataclass
class StoredFile:
    url: str
    key: str
    file_name: str
    mime_type: str


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
        url = _store_r2(content, key, mime_type)
    else:
        url = _store_local(content, key)

    return StoredFile(url=url, key=key, file_name=file_name, mime_type=mime_type)


def _store_local(content: bytes, key: str) -> str:
    _LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    (_LOCAL_DIR / key).write_bytes(content)
    return f"{settings.api_public_url.rstrip('/')}/files/{key}"


def _store_r2(content: bytes, key: str, mime_type: str) -> str:
    import boto3

    client = boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
    )
    client.put_object(
        Bucket=settings.r2_bucket, Key=key, Body=content, ContentType=mime_type
    )
    base = settings.r2_public_base_url.rstrip("/")
    return f"{base}/{key}"


LOCAL_DIR = _LOCAL_DIR
