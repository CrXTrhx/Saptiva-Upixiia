"""baseline: representa database/schema/schema.sql (ya cargado en Neon)

Esta migracion es intencionalmente vacia. El esquema completo (26 tablas,
catalogos, triggers) se carga una sola vez con schema.sql. Se marca como aplicada
con `alembic stamp 0001_baseline`. A partir de aqui, todo cambio de esquema es una
migracion incremental (0002+).

Revision ID: 0001_baseline
Revises:
Create Date: 2026-06-24
"""
from __future__ import annotations

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
