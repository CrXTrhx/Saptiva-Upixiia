"""Constantes de codigos de catalogo (en ingles, como en schema.sql).

Centralizar evita typos en strings repartidos por el codigo.
"""
from __future__ import annotations


class CaseStatus:
    CAPTURING = "CAPTURING"
    RECEIVING = "RECEIVING"
    IN_VALIDATION = "IN_VALIDATION"
    COMPLETE = "COMPLETE"
    INCOMPLETE_EXPIRED = "INCOMPLETE_EXPIRED"
    CANCELLED = "CANCELLED"
    ARCHIVED = "ARCHIVED"


# Estados que cuentan como "carga activa" (para crons y dashboard)
OPEN_STATUSES = {
    CaseStatus.CAPTURING,
    CaseStatus.RECEIVING,
    CaseStatus.IN_VALIDATION,
    CaseStatus.COMPLETE,
    CaseStatus.INCOMPLETE_EXPIRED,
}


class DocStatus:
    PROCESSING = "PROCESSING"  # subido; Document AI lo esta analizando en segundo plano
    RECEIVED = "RECEIVED"
    VALIDATED = "VALIDATED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"
    REPLACED = "REPLACED"


class ChecklistStatus:
    PENDING = "PENDING"
    RECEIVED = "RECEIVED"
    VALIDATED = "VALIDATED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


class DocType:
    OFFICIAL_ID = "OFFICIAL_ID"
    CURP = "CURP"
    TAX_STATUS_CERT = "TAX_STATUS_CERT"
    PROOF_OF_ADDRESS = "PROOF_OF_ADDRESS"
    OTHER = "OTHER"


class Channel:
    WHATSAPP = "WHATSAPP"
    EMAIL = "EMAIL"
    DIRECT_UPLOAD = "DIRECT_UPLOAD"


class RejectionReason:
    ILLEGIBLE = "ILLEGIBLE"
    TYPE_MISMATCH = "TYPE_MISMATCH"
    EXPIRED = "EXPIRED"
    OTHER = "OTHER"


class Priority:
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class NextStepStatus:
    PENDING = "PENDING"
    RESOLVED = "RESOLVED"


class OrphanStatus:
    PENDING = "PENDING"
    ASSIGNED = "ASSIGNED"
    DISCARDED = "DISCARDED"


class OperationType:
    ARMORING = "ARMORING"
    VEHICLE_SALE = "VEHICLE_SALE"
    MIXED = "MIXED"  # resumen de una venta con tipos mezclados (codigo MIX)


class EventType:
    CASE_CREATED = "CASE_CREATED"
    CASE_UPDATED = "CASE_UPDATED"
    STATUS_CHANGED = "STATUS_CHANGED"
    DOCUMENT_RECEIVED = "DOCUMENT_RECEIVED"
    DOCUMENT_VALIDATED = "DOCUMENT_VALIDATED"
    DOCUMENT_REJECTED = "DOCUMENT_REJECTED"
    DOCUMENT_AUTO_REJECTED = "DOCUMENT_AUTO_REJECTED"
    AUTO_REJECT_REVERTED = "AUTO_REJECT_REVERTED"
    DOCUMENT_REPLACED = "DOCUMENT_REPLACED"
    REMINDER_SENT = "REMINDER_SENT"
    INSTRUCTIONS_RESENT = "INSTRUCTIONS_RESENT"
    # Correo resumen (digest) enviado al cliente tras una rafaga de validaciones/rechazos
    CLIENT_NOTIFIED_DIGEST = "CLIENT_NOTIFIED_DIGEST"
    NOTE_ADDED = "NOTE_ADDED"
    CASE_COMPLETED = "CASE_COMPLETED"
    CASE_CANCELLED = "CASE_CANCELLED"
    CASE_ARCHIVED = "CASE_ARCHIVED"
    LLM_QUERY = "LLM_QUERY"
    ORPHAN_ASSIGNED = "ORPHAN_ASSIGNED"


class LlmQuestionType:
    SAT_REPORT = "SAT_REPORT"
    CASH_PAYMENT = "CASH_PAYMENT"


# Documentos requeridos del checklist (persona fisica residente)
CHECKLIST_DOC_TYPES = [
    DocType.OFFICIAL_ID,
    DocType.CURP,
    DocType.TAX_STATUS_CERT,
    DocType.PROOF_OF_ADDRESS,
]

# Tono del evento para la UI del timeline (frontend: ok | warn | accent | neutral)
EVENT_TONE = {
    EventType.CASE_CREATED: "accent",
    EventType.CASE_UPDATED: "neutral",
    EventType.STATUS_CHANGED: "neutral",
    EventType.DOCUMENT_RECEIVED: "ok",
    EventType.DOCUMENT_VALIDATED: "ok",
    EventType.DOCUMENT_REJECTED: "warn",
    EventType.DOCUMENT_AUTO_REJECTED: "warn",
    EventType.AUTO_REJECT_REVERTED: "neutral",
    EventType.DOCUMENT_REPLACED: "neutral",
    EventType.REMINDER_SENT: "neutral",
    EventType.INSTRUCTIONS_RESENT: "neutral",
    EventType.CLIENT_NOTIFIED_DIGEST: "ok",
    EventType.NOTE_ADDED: "neutral",
    EventType.CASE_COMPLETED: "ok",
    EventType.CASE_CANCELLED: "warn",
    EventType.CASE_ARCHIVED: "neutral",
    EventType.LLM_QUERY: "accent",
    EventType.ORPHAN_ASSIGNED: "ok",
}

# Motivos de rechazo en texto legible (para los correos al cliente)
REJECTION_LABEL = {
    RejectionReason.ILLEGIBLE: "el documento es ilegible",
    RejectionReason.TYPE_MISMATCH: "no corresponde al tipo solicitado",
    RejectionReason.EXPIRED: "el documento está vencido",
    RejectionReason.OTHER: "otro motivo",
}
