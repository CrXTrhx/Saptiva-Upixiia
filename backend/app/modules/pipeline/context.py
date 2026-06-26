"""Contexto que fluye por los pasos del pipeline."""
from __future__ import annotations

import datetime as dt
import uuid
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.models import CaseFile, Document


@dataclass
class PipelineContext:
    db: Session
    document: Document
    case: CaseFile
    declared_type: str | None
    file_name: str
    mime_type: str | None
    actor: str = "system"
    actor_user_id: uuid.UUID | None = None

    # Resultado de la extraccion
    detected_type: str | None = None
    confidence: float | None = None
    issue_date: dt.date | None = None
    expiry_date: dt.date | None = None
    fields: dict = field(default_factory=dict)

    # Resultado de la validacion automatica
    rejected: bool = False
    reject_reason: str | None = None
    reject_note: str | None = None

    def reject(self, reason: str, note: str) -> None:
        self.rejected = True
        self.reject_reason = reason
        self.reject_note = note
