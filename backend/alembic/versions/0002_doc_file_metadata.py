"""agrega file_name y mime_type a document y orphan_document

El contrato del frontend (Documento.filename / Documento.mimeType) requiere
conservar el nombre original y el tipo MIME del archivo subido (para preview).

Revision ID: 0002_doc_file_metadata
Revises: 0001_baseline
Create Date: 2026-06-24
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0002_doc_file_metadata"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("document", sa.Column("file_name", sa.String(255), nullable=True))
    op.add_column("document", sa.Column("mime_type", sa.String(120), nullable=True))
    op.add_column("orphan_document", sa.Column("file_name", sa.String(255), nullable=True))
    op.add_column("orphan_document", sa.Column("mime_type", sa.String(120), nullable=True))


def downgrade() -> None:
    op.drop_column("orphan_document", "mime_type")
    op.drop_column("orphan_document", "file_name")
    op.drop_column("document", "mime_type")
    op.drop_column("document", "file_name")
