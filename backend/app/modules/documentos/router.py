"""Endpoints de documentos (upload manual, validar, rechazar, reemplazar)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.core.codes import Channel
from app.core.deps import get_current_user, get_db
from app.core.errors import ValidationError
from app.models import AppUser
from app.modules.documentos import service
from app.modules.documentos.schemas import RechazarRequest
from app.modules.expedientes import serializers
from app.modules.expedientes.service import get_case_or_404

router = APIRouter(tags=["documentos"])

_MAX_BYTES = 15 * 1024 * 1024  # 15 MB


def _read_upload(file: UploadFile) -> bytes:
    content = file.file.read()
    if not content:
        raise ValidationError("El archivo esta vacio")
    if len(content) > _MAX_BYTES:
        raise ValidationError("El archivo excede el tamano maximo (15 MB)")
    return content


@router.post("/expedientes/{case_id}/documentos", status_code=201)
def subir_documento(
    case_id: str,
    tipo: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    case = get_case_or_404(db, case_id)
    content = _read_upload(file)
    doc = service.ingest_document(
        db, case,
        content=content,
        file_name=file.filename or "documento",
        mime_type=file.content_type,
        channel=Channel.DIRECT_UPLOAD,
        sender=user.email,
        declared_type=tipo,
        actor=user.email,
        actor_user_id=user.id,
    )
    return serializers.serialize_documento(db, doc)


@router.patch("/documentos/{doc_id}/validar")
def validar(
    doc_id: str,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    doc = service.get_doc_or_404(db, doc_id)
    service.validar_documento(db, doc, user)
    return serializers.serialize_documento(db, doc)


@router.patch("/documentos/{doc_id}/rechazar")
def rechazar(
    doc_id: str,
    body: RechazarRequest,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    doc = service.get_doc_or_404(db, doc_id)
    service.rechazar_documento(db, doc, body.categoria, body.texto, user)
    return serializers.serialize_documento(db, doc)


@router.patch("/documentos/{doc_id}/revertir-rechazo")
def revertir_rechazo(
    doc_id: str,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    doc = service.get_doc_or_404(db, doc_id)
    service.revertir_rechazo(db, doc, user)
    return serializers.serialize_documento(db, doc)


@router.post("/documentos/{doc_id}/reemplazar", status_code=201)
def reemplazar(
    doc_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    doc = service.get_doc_or_404(db, doc_id)
    content = _read_upload(file)
    nuevo = service.reemplazar_documento(
        db, doc,
        content=content,
        file_name=file.filename or "documento",
        mime_type=file.content_type,
        user=user,
    )
    return serializers.serialize_documento(db, nuevo)
