"""codigo de expediente sin telefono + sufijo aleatorio

Ajusta el formato del codigo de EXP-AAAA-{ultimos4 tel}{BLN|VNT}{NNNNN} (0006) al
formato final EXP-AAAA-{BLN|VNT}{NNNNN}-{XXXX} (ej. EXP-2026-BLN00001-K7MQ):

- Quita los ultimos 4 digitos del telefono (mas corto y facil de escribir).
- El contador NNNNN ahora reinicia por (anio, tipo de operacion).
- Agrega XXXX: 4 caracteres aleatorios de un alfabeto sin caracteres confusos
  (sin 0/O, 1/I/L). Hacen el codigo dificil de adivinar y resistente a errores de
  tecleo (un codigo mal escrito casi nunca coincide con otro real -> cae a huerfanos
  en vez de asignarse al expediente equivocado).

La columna case_file.code ya es varchar(30) desde 0006 (el nuevo mide 22 chars, cabe).
Los expedientes existentes conservan su codigo; solo los nuevos usan el formato final.

Revision ID: 0007_case_code_random_suffix
Revises: 0006_case_code_structure
Create Date: 2026-06-27
"""
from __future__ import annotations

from alembic import op

revision = "0007_case_code_random_suffix"
down_revision = "0006_case_code_structure"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Quitar trigger/funcion/secuencia del formato con telefono (0006).
    op.execute("DROP TRIGGER IF EXISTS tg_case_set_code ON case_file")
    op.execute("DROP FUNCTION IF EXISTS fn_case_set_code()")
    op.execute("DROP TABLE IF EXISTS case_code_sequence")

    # 2. Secuencia ahora por (anio, tipo de operacion).
    op.execute(
        """
        CREATE TABLE case_code_sequence (
            year        int          NOT NULL,
            op_code     varchar(40)  NOT NULL,
            last_number int          NOT NULL DEFAULT 0,
            PRIMARY KEY (year, op_code)
        )
        """
    )

    # 3. Nueva funcion: EXP-AAAA-{BLN|VNT}{NNNNN}-{XXXX} con XXXX = 4 aleatorios.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION fn_case_set_code() RETURNS trigger AS $$
        DECLARE
            v_year   int := EXTRACT(YEAR FROM now())::int;
            v_op     varchar(3);
            v_num    int;
            v_alpha  text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- sin 0,O,1,I,L
            v_suffix text := '';
            i        int;
        BEGIN
            IF NEW.code IS NULL OR NEW.code = '' THEN
                v_op := CASE NEW.operation_type_code
                            WHEN 'ARMORING'     THEN 'BLN'
                            WHEN 'VEHICLE_SALE' THEN 'VNT'
                            ELSE 'GEN'
                        END;
                INSERT INTO case_code_sequence(year, op_code, last_number)
                VALUES (v_year, NEW.operation_type_code, 1)
                ON CONFLICT (year, op_code)
                    DO UPDATE SET last_number = case_code_sequence.last_number + 1
                RETURNING last_number INTO v_num;

                -- 4 caracteres aleatorios (clave anti-confusion / anti-typo)
                FOR i IN 1..4 LOOP
                    v_suffix := v_suffix || substr(v_alpha, floor(random() * length(v_alpha))::int + 1, 1);
                END LOOP;

                NEW.code := 'EXP-' || v_year || '-' || v_op || lpad(v_num::text, 5, '0') || '-' || v_suffix;
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
    # Restaura el formato 0006 (con telefono, contador por anio+tel+operacion).
    op.execute("DROP TRIGGER IF EXISTS tg_case_set_code ON case_file")
    op.execute("DROP FUNCTION IF EXISTS fn_case_set_code()")
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
