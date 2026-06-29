"""marca de borrado temporal del archivo de versiones reemplazadas

Cuando el cron purga de R2 una version reemplazada vieja (2+ niveles atras y con
mas de N dias), la fila se conserva como auditoria pero su archivo ya no existe.
`file_purged_at` registra ese momento y evita reintentar el borrado.

Revision ID: 0005_doc_file_purged
Revises: 0004_doc_status_processing
Create Date: 2026-06-26
"""
from __future__ import annotations

from alembic import op

revision = "0005_doc_file_purged"
down_revision = "0004_doc_status_processing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE document ADD COLUMN IF NOT EXISTS file_purged_at timestamptz"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE document DROP COLUMN IF EXISTS file_purged_at")
