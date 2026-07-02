"""completed_at/archived_at en case_file + transiciones de rechazo y desarchivado

Agrega el reloj de cierre del expediente (completed_at, archived_at) que usa el
auto-archivado, y las tres transiciones nuevas del rediseño de estados:
  * COMPLETE -> RECEIVING            (se rechaza un documento de un expediente completo)
  * ARCHIVED -> COMPLETE             (desarchivar manual)
  * ARCHIVED -> INCOMPLETE_EXPIRED   (vence un documento de un expediente archivado)

Revision ID: 0010_case_completed_archived
Revises: 0009_doc_status_discarded
Create Date: 2026-07-02
"""
from __future__ import annotations

from alembic import op

revision = "0010_case_completed_archived"
down_revision = "0009_doc_status_discarded"
branch_labels = None
depends_on = None

_NEW_TRANSITIONS = [
    ("COMPLETE", "RECEIVING", "Documento rechazado, regresa a recepcion"),
    ("ARCHIVED", "COMPLETE", "Desarchivar"),
    ("ARCHIVED", "INCOMPLETE_EXPIRED", "Documento vencido en expediente archivado"),
]


def upgrade() -> None:
    op.execute("ALTER TABLE case_file ADD COLUMN IF NOT EXISTS completed_at timestamptz")
    op.execute("ALTER TABLE case_file ADD COLUMN IF NOT EXISTS archived_at timestamptz")
    # Backfill de expedientes ya cerrados antes de esta migracion: su updated_at es la
    # mejor aproximacion al momento de completado/archivado, para que el auto-archivado
    # tenga un reloj desde el que medir (si no, completed_at seria NULL para siempre).
    op.execute(
        "UPDATE case_file SET completed_at = updated_at "
        "WHERE status_code = 'COMPLETE' AND completed_at IS NULL"
    )
    op.execute(
        "UPDATE case_file SET archived_at = updated_at "
        "WHERE status_code = 'ARCHIVED' AND archived_at IS NULL"
    )
    for frm, to, label in _NEW_TRANSITIONS:
        op.execute(
            "INSERT INTO cat_case_status_transition (from_code, to_code, label_es) "
            f"VALUES ('{frm}', '{to}', '{label}') ON CONFLICT DO NOTHING"
        )


def downgrade() -> None:
    for frm, to, _ in _NEW_TRANSITIONS:
        op.execute(
            "DELETE FROM cat_case_status_transition "
            f"WHERE from_code = '{frm}' AND to_code = '{to}'"
        )
    op.execute("ALTER TABLE case_file DROP COLUMN IF EXISTS archived_at")
    op.execute("ALTER TABLE case_file DROP COLUMN IF EXISTS completed_at")
