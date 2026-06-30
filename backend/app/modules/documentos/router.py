"""Endpoints de documentos (upload manual, validar, rechazar, reemplazar)."""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.core.codes import Channel
from app.core.deps import get_current_user, get_db
from app.core.errors import ValidationError
from app.models import AppUser
from app.modules.documentos import notificaciones, service
from app.modules.documentos.schemas import RechazarRequest
from app.modules.expedientes import serializers
from app.modules.expedientes.service import get_case_or_404

router = APIRouter(tags=["documentos"])

_MAX_BYTES = 15 * 1024 * 1024  # 15 MB

# Solo se aceptan PDF e imagenes (documentos de identidad / comprobantes). Bloquea
# subir HTML/SVG/ejecutables que podrian servirse luego desde el storage.
_ALLOWED_MIME = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/tiff",
}


def _read_upload(file: UploadFile) -> bytes:
    mime = (file.content_type or "").split(";")[0].strip().lower()
    if mime not in _ALLOWED_MIME:
        raise ValidationError(
            "Tipo de archivo no permitido. Sube un PDF o una imagen "
            "(JPG, PNG, WEBP, HEIC o TIFF)."
        )
    content = file.file.read()
    if not content:
        raise ValidationError("El archivo esta vacio")
    if len(content) > _MAX_BYTES:
        raise ValidationError("El archivo excede el tamano maximo (15 MB)")
    return content


@router.post("/expedientes/{case_id}/documentos", status_code=201)
def subir_documento(
    case_id: str,
    background_tasks: BackgroundTasks,
    tipo: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    case = get_case_or_404(db, case_id)
    content = _read_upload(file)
    # 1) Se guarda el documento en PROCESSING y se devuelve de inmediato (la modal del
    #    frontend se cierra y muestra una barra de "procesando"). 2) El analisis con
    #    Document AI corre en segundo plano. Asi el estado sobrevive a un reload.
    doc = service.create_processing_document(
        db, case,
        content=content,
        file_name=file.filename or "documento",
        mime_type=file.content_type,
        channel=Channel.DIRECT_UPLOAD,
        sender=user.email,
        declared_type=tipo,
    )
    db.commit()  # persiste antes de que arranque la tarea en segundo plano
    background_tasks.add_task(
        service.process_document,
        str(doc.id), actor=user.email, actor_user_id=user.id,
    )
    return serializers.serialize_documento(db, doc)


@router.patch("/documentos/{doc_id}/validar")
def validar(
    doc_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    doc = service.get_doc_or_404(db, doc_id)
    service.validar_documento(db, doc, user)
    # Agenda el correo resumen (digest) en segundo plano. Se agrupan las validaciones/
    # rechazos de la misma rafaga en un solo correo para no hacer spam al cliente.
    background_tasks.add_task(
        notificaciones.programar_digest, doc.case_file_id, user.email, user.id
    )
    return serializers.serialize_documento(db, doc)


@router.patch("/documentos/{doc_id}/rechazar")
def rechazar(
    doc_id: str,
    body: RechazarRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    doc = service.get_doc_or_404(db, doc_id)
    service.rechazar_documento(db, doc, body.categoria, body.texto, user)
    # Agenda el correo resumen (digest) en segundo plano. Se agrupan las validaciones/
    # rechazos de la misma rafaga en un solo correo para no hacer spam al cliente.
    background_tasks.add_task(
        notificaciones.programar_digest, doc.case_file_id, user.email, user.id
    )
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
    background_tasks: BackgroundTasks,
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
    db.commit()  # persiste el reemplazo antes de arrancar la tarea en segundo plano
    background_tasks.add_task(
        service.process_document,
        str(nuevo.id), actor=user.email, actor_user_id=user.id,
    )
    return serializers.serialize_documento(db, nuevo)


@router.post("/documentos/{doc_id}/restaurar-version")
def restaurar_version(
    doc_id: str,
    db: Session = Depends(get_db),
    user: AppUser = Depends(get_current_user),
):
    doc = service.get_doc_or_404(db, doc_id)
    restaurado = service.restaurar_version(db, doc, user)
    return serializers.serialize_documento(db, restaurado)
