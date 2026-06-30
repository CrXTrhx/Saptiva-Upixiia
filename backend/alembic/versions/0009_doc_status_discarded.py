"""agrega el estado DISCARDED y la columna discarded_at a documento

Permite descartar un documento ya rechazado para limpiar el espacio de trabajo sin
perderlo: el documento queda fuera del flujo activo pero se conserva (auditoria y
vista de "Descartados", con opcion de restaurar). Se agregan tambien los tipos de
evento DOCUMENT_DISCARDED y DOCUMENT_RESTORED al catalogo.

Revision ID: 0009_doc_status_discarded
Revises: 0008_case_operations
Create Date: 2026-06-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0009_doc_status_discarded"
down_revision = "0008_case_operations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "INSERT INTO cat_document_status(code, label_es, sort_order) "
        "VALUES ('DISCARDED', 'Descartado', 6) "
        "ON CONFLICT (code) DO NOTHING"
    )
    op.execute(
        "INSERT INTO cat_event_type(code, label_es) VALUES "
        "('DOCUMENT_DISCARDED', 'Documento descartado'), "
        "('DOCUMENT_RESTORED', 'Documento restaurado') "
        "ON CONFLICT (code) DO NOTHING"
    )
    op.add_column(
        "document",
        sa.Column("discarded_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("document", "discarded_at")
    op.execute(
        "DELETE FROM cat_event_type WHERE code IN ('DOCUMENT_DISCARDED', 'DOCUMENT_RESTORED')"
    )
    op.execute("DELETE FROM cat_document_status WHERE code = 'DISCARDED'")
