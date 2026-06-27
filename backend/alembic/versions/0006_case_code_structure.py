"""nuevo formato de codigo de expediente

Cambia el codigo de EXP-AAAA-NNNNN al formato
EXP-AAAA-{ultimos4 del telefono}{BLN|VNT}{NNNNN} (ej. EXP-2026-7892BLN00001).

- Amplia case_file.code de varchar(20) a varchar(30) (el nuevo mide 21 chars).
- Reemplaza case_code_sequence: el contador ahora es por (anio, ultimos4 tel, operacion).
- Reescribe fn_case_set_code para armar el codigo con telefono + tipo de operacion.
- Elimina fn_next_case_code (ya no se usa).

Los expedientes existentes conservan su codigo viejo; solo los nuevos usan el formato nuevo.

Revision ID: 0006_case_code_structure
Revises: 0005_doc_file_purged
Create Date: 2026-06-27
"""
from __future__ import annotations

from alembic import op

revision = "0006_case_code_structure"
down_revision = "0005_doc_file_purged"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Ampliar la columna code (EXP-AAAA-####OPP##### = 21 chars).
    op.execute("ALTER TABLE case_file ALTER COLUMN code TYPE varchar(30)")

    # 2. Reemplazar la secuencia: ahora el contador es por (anio, ultimos4 tel, operacion).
    op.execute("DROP TRIGGER IF EXISTS tg_case_set_code ON case_file")
    op.execute("DROP FUNCTION IF EXISTS fn_next_case_code()")
    op.execute("DROP TABLE IF EXISTS case_code_sequence")
    op.execute(
        """
        CREATE TABLE case_code_sequence (
            year        int          NOT NULL,
            phone_last4 varchar(4)   NOT NULL,
            op_code     varchar(40)  NOT NULL,
            last_number int          NOT NULL DEFAULT 0,
            PRIMARY KEY (year, phone_last4, op_code)
        )
        """
    )

    # 3. Nueva funcion del trigger: arma el codigo con telefono + tipo de operacion.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION fn_case_set_code() RETURNS trigger AS $$
        DECLARE
            v_year  int := EXTRACT(YEAR FROM now())::int;
            v_last4 varchar(4);
            v_op    varchar(3);
            v_num   int;
        BEGIN
            IF NEW.code IS NULL OR NEW.code = '' THEN
                v_last4 := lpad(right(regexp_replace(coalesce(NEW.client_phone, ''), '[^0-9]', '', 'g'), 4), 4, '0');
                v_op := CASE NEW.operation_type_code
                            WHEN 'ARMORING'     THEN 'BLN'
                            WHEN 'VEHICLE_SALE' THEN 'VNT'
                            ELSE 'GEN'
                        END;
                INSERT INTO case_code_sequence(year, phone_last4, op_code, last_number)
                VALUES (v_year, v_last4, NEW.operation_type_code, 1)
                ON CONFLICT (year, phone_last4, op_code)
                    DO UPDATE SET last_number = case_code_sequence.last_number + 1
                RETURNING last_number INTO v_num;

                NEW.code := 'EXP-' || v_year || '-' || v_last4 || v_op || lpad(v_num::text, 5, '0');
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER tg_case_set_code BEFORE INSERT ON case_file
            FOR EACH ROW EXECUTE FUNCTION fn_case_set_code()
        """
    )


def downgrade() -> None:
    # Restaura el formato viejo EXP-AAAA-NNNNN (contador por anio).
    op.execute("DROP TRIGGER IF EXISTS tg_case_set_code ON case_file")
    op.execute("DROP TABLE IF EXISTS case_code_sequence")
    op.execute(
        """
        CREATE TABLE case_code_sequence (
            year        int      PRIMARY KEY,
            last_number int      NOT NULL DEFAULT 0
        )
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION fn_next_case_code() RETURNS varchar AS $$
        DECLARE
            v_year int := EXTRACT(YEAR FROM now())::int;
            v_num  int;
        BEGIN
            INSERT INTO case_code_sequence(year, last_number)
            VALUES (v_year, 1)
            ON CONFLICT (year) DO UPDATE SET last_number = case_code_sequence.last_number + 1
            RETURNING last_number INTO v_num;
            RETURN 'EXP-' || v_year || '-' || lpad(v_num::text, 5, '0');
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION fn_case_set_code() RETURNS trigger AS $$
        BEGIN
            IF NEW.code IS NULL OR NEW.code = '' THEN
                NEW.code := fn_next_case_code();
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER tg_case_set_code BEFORE INSERT ON case_file
            FOR EACH ROW EXECUTE FUNCTION fn_case_set_code()
        """
    )
    op.execute("ALTER TABLE case_file ALTER COLUMN code TYPE varchar(20)")
