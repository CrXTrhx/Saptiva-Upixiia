"""Modelos SQLAlchemy mapeados a las tablas EXISTENTES (schema.sql es la baseline).

No se autogenera DDL desde aqui: las tablas ya existen en Neon. Solo se exponen
las columnas que el backend usa.
"""
from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    FetchedValue,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )


class AppUser(Base):
    __tablename__ = "app_user"

    id: Mapped[uuid.UUID] = _uuid_pk()
    email: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))
    role_code: Mapped[str] = mapped_column(String(40), default="INTERNAL")
    active_flag: Mapped[int] = mapped_column(SmallInteger, default=1)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())


class CaseFile(Base):
    __tablename__ = "case_file"

    id: Mapped[uuid.UUID] = _uuid_pk()
    # code lo genera el trigger tg_case_set_code; FetchedValue para recuperarlo via RETURNING.
    # Formato EXP-AAAA-####{BLN|VNT}##### (21 chars); 30 deja holgura.
    code: Mapped[str] = mapped_column(String(30), server_default=FetchedValue())
    client_name: Mapped[str] = mapped_column(String(255))
    client_phone: Mapped[str | None] = mapped_column(String(30))
    client_email: Mapped[str | None] = mapped_column(String(255))
    client_rfc: Mapped[str | None] = mapped_column(String(13))
    client_curp: Mapped[str | None] = mapped_column(String(18))
    client_postal_code: Mapped[str | None] = mapped_column(String(10))
    estimated_amount: Mapped[float] = mapped_column(Numeric(14, 2))
    operation_type_code: Mapped[str] = mapped_column(String(40))
    status_code: Mapped[str] = mapped_column(String(40), server_default=FetchedValue())
    cancellation_reason: Mapped[str | None] = mapped_column(Text)
    assigned_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("app_user.id"))
    active_flag: Mapped[int] = mapped_column(SmallInteger, default=1)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))


class CaseOperation(Base):
    """Una operacion de la venta (un auto, un blindaje, etc.). Una venta tiene 1+N.

    Las operaciones se capturan una por una (3 blindajes = 3 filas), cada una con su
    propio monto. case_file.operation_type_code es el RESUMEN (tipo unico o 'MIXED');
    el detalle por linea vive aqui. case_file.estimated_amount = suma de amount.
    """
    __tablename__ = "case_operation"

    id: Mapped[uuid.UUID] = _uuid_pk()
    case_file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("case_file.id"))
    operation_type_code: Mapped[str] = mapped_column(String(40))
    amount: Mapped[float] = mapped_column(Numeric(14, 2))
    sort_order: Mapped[int] = mapped_column(SmallInteger, default=0)
    active_flag: Mapped[int] = mapped_column(SmallInteger, default=1)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())


class Document(Base):
    __tablename__ = "document"

    id: Mapped[uuid.UUID] = _uuid_pk()
    case_file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("case_file.id"))
    declared_type_code: Mapped[str | None] = mapped_column(String(40))
    detected_type_code: Mapped[str | None] = mapped_column(String(40))
    file_url: Mapped[str] = mapped_column(Text)
    file_name: Mapped[str | None] = mapped_column(String(255))
    mime_type: Mapped[str | None] = mapped_column(String(120))
    channel_code: Mapped[str] = mapped_column(String(40))
    sender: Mapped[str | None] = mapped_column(String(255))
    extracted_data: Mapped[dict | None] = mapped_column(JSONB)
    extraction_confidence: Mapped[float | None] = mapped_column(Numeric(5, 2))
    issue_date: Mapped[dt.date | None] = mapped_column(Date)
    expiry_date: Mapped[dt.date | None] = mapped_column(Date)
    status_code: Mapped[str] = mapped_column(String(40), server_default=FetchedValue())
    rejection_reason_code: Mapped[str | None] = mapped_column(String(40))
    rejection_note: Mapped[str | None] = mapped_column(Text)
    is_auto_rejected: Mapped[int] = mapped_column(SmallInteger, default=0)
    replaced_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("document.id"))
    # Momento en que el cron borro el archivo de R2 (versiones reemplazadas viejas).
    # La fila se conserva como auditoria; si no es None, file_url ya no existe en R2.
    file_purged_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    # Momento en que el usuario descarto el documento (status DISCARDED). Se conserva
    # para auditoria y para listarlo en "Descartados"; None si esta en el flujo activo.
    discarded_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    reception_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())
    validated_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    validated_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    active_flag: Mapped[int] = mapped_column(SmallInteger, default=1)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())


class CaseChecklistItem(Base):
    __tablename__ = "case_checklist_item"

    id: Mapped[uuid.UUID] = _uuid_pk()
    case_file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("case_file.id"))
    document_type_code: Mapped[str] = mapped_column(String(40))
    status_code: Mapped[str] = mapped_column(String(40), server_default=FetchedValue())
    current_document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    active_flag: Mapped[int] = mapped_column(SmallInteger, default=1)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())


class NextStep(Base):
    __tablename__ = "next_step"

    id: Mapped[uuid.UUID] = _uuid_pk()
    case_file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("case_file.id"))
    description: Mapped[str] = mapped_column(Text)
    priority_code: Mapped[str] = mapped_column(String(40), server_default=FetchedValue())
    status_code: Mapped[str] = mapped_column(String(40), server_default=FetchedValue())
    resolved_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    active_flag: Mapped[int] = mapped_column(SmallInteger, default=1)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())


class InternalNote(Base):
    __tablename__ = "internal_note"

    id: Mapped[uuid.UUID] = _uuid_pk()
    case_file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("case_file.id"))
    author_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("app_user.id"))
    body: Mapped[str] = mapped_column(Text)
    active_flag: Mapped[int] = mapped_column(SmallInteger, default=1)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())


class CaseEvent(Base):
    __tablename__ = "case_event"

    id: Mapped[uuid.UUID] = _uuid_pk()
    case_file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("case_file.id"))
    event_type_code: Mapped[str] = mapped_column(String(50))
    description: Mapped[str | None] = mapped_column(Text)
    actor: Mapped[str | None] = mapped_column(String(255))
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    event_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB)
    event_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())
    active_flag: Mapped[int] = mapped_column(SmallInteger, default=1)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())


class OrphanDocument(Base):
    __tablename__ = "orphan_document"

    id: Mapped[uuid.UUID] = _uuid_pk()
    file_url: Mapped[str] = mapped_column(Text)
    file_name: Mapped[str | None] = mapped_column(String(255))
    mime_type: Mapped[str | None] = mapped_column(String(120))
    channel_code: Mapped[str] = mapped_column(String(40))
    sender: Mapped[str | None] = mapped_column(String(255))
    message_text: Mapped[str | None] = mapped_column(Text)
    extracted_data: Mapped[dict | None] = mapped_column(JSONB)
    extracted_curp: Mapped[str | None] = mapped_column(String(18))
    extracted_rfc: Mapped[str | None] = mapped_column(String(13))
    extracted_postal_code: Mapped[str | None] = mapped_column(String(10))
    suggested_document_type_code: Mapped[str | None] = mapped_column(String(40))
    suggested_case_file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    status_code: Mapped[str] = mapped_column(String(40), server_default=FetchedValue())
    assigned_case_file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    resulting_document_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    discard_reason: Mapped[str | None] = mapped_column(Text)
    reception_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())
    active_flag: Mapped[int] = mapped_column(SmallInteger, default=1)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())


class LlmQuery(Base):
    __tablename__ = "llm_query"

    id: Mapped[uuid.UUID] = _uuid_pk()
    case_file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("case_file.id"))
    question_type_code: Mapped[str] = mapped_column(String(40))
    question_text: Mapped[str | None] = mapped_column(Text)
    answer_bool: Mapped[bool | None] = mapped_column(Boolean)
    answer_reason: Mapped[str | None] = mapped_column(Text)
    amount_at_query: Mapped[float | None] = mapped_column(Numeric(14, 2))
    operation_type_code: Mapped[str | None] = mapped_column(String(40))
    raw_response: Mapped[dict | None] = mapped_column(JSONB)
    query_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())
    active_flag: Mapped[int] = mapped_column(SmallInteger, default=1)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=FetchedValue())


# --- Catalogos (solo lectura) ---


class CatOperationType(Base):
    __tablename__ = "cat_operation_type"

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    label_es: Mapped[str] = mapped_column(String(100))
    lfpiorpi_fraction: Mapped[str | None] = mapped_column(String(10))
    identification_threshold: Mapped[float] = mapped_column(Numeric(14, 2))
    sat_report_threshold: Mapped[float] = mapped_column(Numeric(14, 2))
    cash_limit_threshold: Mapped[float] = mapped_column(Numeric(14, 2))


class CatChecklistTemplate(Base):
    __tablename__ = "cat_checklist_template"

    operation_type_code: Mapped[str] = mapped_column(String(40), primary_key=True)
    document_type_code: Mapped[str] = mapped_column(String(40), primary_key=True)
    sort_order: Mapped[int] = mapped_column(SmallInteger, default=0)
    active_flag: Mapped[int] = mapped_column(SmallInteger, default=1)


class CatDocumentType(Base):
    __tablename__ = "cat_document_type"

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    label_es: Mapped[str] = mapped_column(String(120))
    is_checklist_item: Mapped[int] = mapped_column(SmallInteger, default=0)
    validity_months: Mapped[int | None] = mapped_column(SmallInteger)
    never_expires: Mapped[int] = mapped_column(SmallInteger, default=0)
    expires_with_fiscal_year: Mapped[int] = mapped_column(SmallInteger, default=0)
    uses_document_expiry: Mapped[int] = mapped_column(SmallInteger, default=0)
    sort_order: Mapped[int] = mapped_column(SmallInteger, default=0)


class CatCaseStatusTransition(Base):
    __tablename__ = "cat_case_status_transition"

    from_code: Mapped[str] = mapped_column(String(40), primary_key=True)
    to_code: Mapped[str] = mapped_column(String(40), primary_key=True)
