"""agrega el estado PROCESSING al catalogo de estados de documento

El analisis con Document AI corre en segundo plano: el documento se guarda primero
con estado PROCESSING (visible al recargar) y el pipeline lo actualiza al terminar.

Revision ID: 0004_doc_status_processing
Revises: 0003_event_case_updated
Create Date: 2026-06-26
"""
from __future__ import annotations

from alembic import op

revision = "0004_doc_status_processing"
down_revision = "0003_event_case_updated"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "INSERT INTO cat_document_status(code, label_es, sort_order) "
        "VALUES ('PROCESSING', 'Procesando', 0) "
        "ON CONFLICT (code) DO NOTHING"
    )


def downgrade() -> None:
    op.execute("DELETE FROM cat_document_status WHERE code = 'PROCESSING'")
