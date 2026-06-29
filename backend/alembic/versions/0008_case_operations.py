"""multiples operaciones por venta

Una venta puede contener varias operaciones (2 autos, 2 autos + 1 blindaje, etc.).
Hasta ahora cada case_file tenia un solo operation_type_code; ahora ese campo pasa a
ser un RESUMEN (el tipo unico, o 'MIXED' si la venta mezcla tipos) y el detalle vive
en la nueva tabla hija case_operation (una fila por operacion: tipo + monto). Las
operaciones se capturan una por una (3 blindajes = 3 filas), cada una con su propio
monto, ya que pueden tener precios distintos.

- Agrega el tipo de catalogo 'MIXED' ('Mixto') con umbrales conservadores (el minimo
  entre ARMORING y VEHICLE_SALE) para que el cumplimiento siempre exija identificacion.
- Anade la rama 'MIXED' -> 'MIX' al trigger fn_case_set_code (codigo EXP-AAAA-MIX#####-XXXX).
- Crea case_operation y hace backfill: una fila por cada case_file existente
  (amount = estimated_amount), conservando su codigo y monto.

El checklist NO necesita plantilla para 'MIXED': el servicio lo materializa como la
union de las plantillas de los tipos distintos de la venta (los 4 documentos de
identidad del cliente son identicos para ambos tipos).

Revision ID: 0008_case_operations
Revises: 0007_case_code_random_suffix
Create Date: 2026-06-29
"""
from __future__ import annotations

from alembic import op

revision = "0008_case_operations"
down_revision = "0007_case_code_random_suffix"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Tipo de operacion 'MIXED' (umbrales = el minimo entre ARMORING y VEHICLE_SALE,
    #    para errar siempre hacia exigir identificacion en ventas mezcladas).
    op.execute(
        """
        INSERT INTO cat_operation_type
            (code, label_es, lfpiorpi_fraction, identification_threshold,
             sat_report_threshold, cash_limit_threshold, sort_order)
        VALUES
            ('MIXED', 'Mixto', NULL, 282717.10, 564847.65, 376565.10, 3)
        ON CONFLICT (code) DO NOTHING
        """
    )

    # 2. Trigger del codigo: agregar la rama MIX. El contador por (anio, op_code) ya
    #    soporta el nuevo prefijo sin cambios.
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
                            WHEN 'MIXED'        THEN 'MIX'
                            ELSE 'GEN'
                        END;
                INSERT INTO case_code_sequence(year, op_code, last_number)
                VALUES (v_year, NEW.operation_type_code, 1)
                ON CONFLICT (year, op_code)
                    DO UPDATE SET last_number = case_code_sequence.last_number + 1
                RETURNING last_number INTO v_num;

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

    # 3. Tabla hija: una fila por operacion de la venta.
    op.execute(
        """
        CREATE TABLE case_operation (
            id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
            case_file_id        uuid          NOT NULL REFERENCES case_file(id),
            operation_type_code varchar(40)   NOT NULL REFERENCES cat_operation_type(code),
            amount              numeric(14,2) NOT NULL CHECK (amount >= 0),
            sort_order          smallint      NOT NULL DEFAULT 0,
            active_flag         smallint      NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
            created_at          timestamptz   NOT NULL DEFAULT now(),
            updated_at          timestamptz   NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX ix_caseop_case ON case_operation (case_file_id)")

    # 4. Backfill: una operacion por cada expediente existente (tipo actual, qty 1,
    #    monto = total). Su operation_type_code de resumen y su codigo no cambian.
    op.execute(
        """
        INSERT INTO case_operation
            (case_file_id, operation_type_code, amount, sort_order)
        SELECT id, operation_type_code, estimated_amount, 0
        FROM case_file
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS case_operation")

    # Revertir el trigger a solo BLN/VNT/GEN.
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

    # Quitar el tipo MIXED (solo si ningun expediente quedo como MIXED).
    op.execute("DELETE FROM cat_operation_type WHERE code = 'MIXED'")
