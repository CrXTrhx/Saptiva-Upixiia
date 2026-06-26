"""agrega el tipo de evento CASE_UPDATED al catalogo

Necesario para registrar en el timeline la edicion de datos del cliente/operacion
(Flujo C del PRD: 'Editar datos del cliente y operacion').

Revision ID: 0003_event_case_updated
Revises: 0002_doc_file_metadata
Create Date: 2026-06-24
"""
from __future__ import annotations

from alembic import op

revision = "0003_event_case_updated"
down_revision = "0002_doc_file_metadata"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "INSERT INTO cat_event_type(code, label_es) "
        "VALUES ('CASE_UPDATED', 'Datos del expediente actualizados') "
        "ON CONFLICT (code) DO NOTHING"
    )


def downgrade() -> None:
    op.execute("DELETE FROM cat_event_type WHERE code = 'CASE_UPDATED'")
