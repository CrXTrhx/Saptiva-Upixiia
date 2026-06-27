-- =============================================================================
-- SAPTIVA AML — MVP (cliente: CENTUR)
-- Esquema PostgreSQL 16
-- -----------------------------------------------------------------------------
-- Convenciones:
--   * Identificadores en INGLES, snake_case, escritos en MAYUSCULAS en el DDL.
--     (Postgres pliega identificadores sin comillas a minusculas: escribir
--      MAYUSCULAS o minusculas es indistinto al consultar.)
--   * CODIGOS de catalogo en INGLES MAYUSCULAS. Cada catalogo lleva LABEL_ES
--     para que la UI muestre el texto en espanol.
--   * Soft delete: ACTIVE_FLAG SMALLINT (1 = vigente, 0 = inactivo). Nada se borra.
--   * Auditoria: todas las tablas de negocio llevan CREATED_AT / UPDATED_AT /
--     CREATED_BY / UPDATED_BY + bitacora tecnica en AUDIT_LOG (por triggers).
--   * Enumeraciones modeladas como CATALOGOS (tablas CAT_*) referenciados por FK.
--     La FK al catalogo ES la restriccion de integridad (mas extensible que un
--     ENUM/CHECK para la v1). CHECK se usa para flags binarios y reglas simples.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- busqueda parcial (nombre, rfc, etc.)

-- =============================================================================
-- 0. FUNCIONES DE INFRAESTRUCTURA (updated_at + bitacora)
-- =============================================================================

-- Mantiene UPDATED_AT en cada UPDATE
CREATE OR REPLACE FUNCTION fn_set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Bitacora tecnica generica: registra INSERT / UPDATE / DELETE / SOFT_DELETE
-- en AUDIT_LOG. La app puede inyectar el usuario actual con:
--     SET LOCAL app.current_user_id    = '<uuid>';
--     SET LOCAL app.current_user_label = '<email o nombre>';
CREATE OR REPLACE FUNCTION fn_audit() RETURNS trigger AS $$
DECLARE
    v_user    uuid;
    v_label   text;
    v_action  varchar(20);
    v_rec_id  text;
BEGIN
    BEGIN
        v_user := nullif(current_setting('app.current_user_id', true), '')::uuid;
    EXCEPTION WHEN others THEN
        v_user := NULL;
    END;
    v_label := nullif(current_setting('app.current_user_label', true), '');

    IF (TG_OP = 'INSERT') THEN
        v_rec_id := NEW.id::text;
        INSERT INTO audit_log(table_name, record_id, action_code, old_data, new_data, changed_by, changed_by_label)
        VALUES (TG_TABLE_NAME, v_rec_id, 'INSERT', NULL, to_jsonb(NEW), v_user, v_label);
        RETURN NEW;

    ELSIF (TG_OP = 'UPDATE') THEN
        v_rec_id := NEW.id::text;
        v_action := CASE
            WHEN NEW.active_flag = 0 AND OLD.active_flag = 1 THEN 'SOFT_DELETE'
            ELSE 'UPDATE'
        END;
        INSERT INTO audit_log(table_name, record_id, action_code, old_data, new_data, changed_by, changed_by_label)
        VALUES (TG_TABLE_NAME, v_rec_id, v_action, to_jsonb(OLD), to_jsonb(NEW), v_user, v_label);
        RETURN NEW;

    ELSIF (TG_OP = 'DELETE') THEN
        v_rec_id := OLD.id::text;
        INSERT INTO audit_log(table_name, record_id, action_code, old_data, new_data, changed_by, changed_by_label)
        VALUES (TG_TABLE_NAME, v_rec_id, 'DELETE', to_jsonb(OLD), NULL, v_user, v_label);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. BITACORA TECNICA (append-only, sin soft delete)
-- =============================================================================
CREATE TABLE audit_log (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name        varchar(63)  NOT NULL,
    record_id         varchar(64)  NOT NULL,
    action_code       varchar(20)  NOT NULL,           -- INSERT|UPDATE|DELETE|SOFT_DELETE
    old_data          jsonb,
    new_data          jsonb,
    changed_by        uuid,                            -- app_user.id (si se inyecta)
    changed_by_label  varchar(255),                    -- email/nombre o 'system'
    changed_at        timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_table_record ON audit_log (table_name, record_id);
CREATE INDEX ix_audit_changed_at   ON audit_log (changed_at);

-- =============================================================================
-- 2. CATALOGOS (CAT_*)
-- =============================================================================

-- Rol de usuario (MVP solo INTERNAL; v1 agrega los demas)
CREATE TABLE cat_user_role (
    code        varchar(40)  PRIMARY KEY,
    label_es    varchar(100) NOT NULL,
    description text,
    sort_order  smallint     NOT NULL DEFAULT 0,
    active_flag smallint     NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Tipo de operacion + umbrales LFPIORPI (los consume el LLM y las reglas)
CREATE TABLE cat_operation_type (
    code                     varchar(40)   PRIMARY KEY,
    label_es                 varchar(100)  NOT NULL,
    lfpiorpi_fraction        varchar(10),               -- 'IX', 'VIII'
    identification_threshold numeric(14,2) NOT NULL,     -- arriba => requiere expediente
    sat_report_threshold     numeric(14,2) NOT NULL,     -- arriba => aviso al SAT
    cash_limit_threshold     numeric(14,2) NOT NULL,     -- limite efectivo Art. 32
    sort_order               smallint      NOT NULL DEFAULT 0,
    active_flag              smallint      NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at               timestamptz   NOT NULL DEFAULT now(),
    updated_at               timestamptz   NOT NULL DEFAULT now()
);

-- Estados del expediente (la "maquina de estados" principal)
CREATE TABLE cat_case_status (
    code        varchar(40)  PRIMARY KEY,
    label_es    varchar(100) NOT NULL,
    description text,
    sort_order  smallint     NOT NULL DEFAULT 0,   -- estado 1 -> 2 -> 3 ...
    is_open     smallint     NOT NULL DEFAULT 1 CHECK (is_open IN (0,1)),     -- cuenta como carga activa
    is_terminal smallint     NOT NULL DEFAULT 0 CHECK (is_terminal IN (0,1)), -- no se modifica mas
    active_flag smallint     NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Transiciones validas de estado de expediente (auditable / opcionalmente forzable)
CREATE TABLE cat_case_status_transition (
    from_code   varchar(40) NOT NULL REFERENCES cat_case_status(code),
    to_code     varchar(40) NOT NULL REFERENCES cat_case_status(code),
    label_es    varchar(120),
    PRIMARY KEY (from_code, to_code)
);

-- Tipo de documento + reglas de vigencia
CREATE TABLE cat_document_type (
    code                     varchar(40)  PRIMARY KEY,
    label_es                 varchar(120) NOT NULL,
    is_checklist_item        smallint     NOT NULL DEFAULT 0 CHECK (is_checklist_item IN (0,1)),
    validity_months          smallint,                 -- p.ej. comprobante = 3
    never_expires            smallint     NOT NULL DEFAULT 0 CHECK (never_expires IN (0,1)),       -- CURP
    expires_with_fiscal_year smallint     NOT NULL DEFAULT 0 CHECK (expires_with_fiscal_year IN (0,1)), -- CSF
    uses_document_expiry     smallint     NOT NULL DEFAULT 0 CHECK (uses_document_expiry IN (0,1)),     -- INE
    sort_order               smallint     NOT NULL DEFAULT 0,
    active_flag              smallint     NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at               timestamptz  NOT NULL DEFAULT now(),
    updated_at               timestamptz  NOT NULL DEFAULT now()
);

-- Estado de un documento recibido
CREATE TABLE cat_document_status (
    code        varchar(40)  PRIMARY KEY,
    label_es    varchar(100) NOT NULL,
    sort_order  smallint     NOT NULL DEFAULT 0,
    active_flag smallint     NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Estado de cada renglon del checklist (vista estatica)
CREATE TABLE cat_checklist_status (
    code        varchar(40)  PRIMARY KEY,
    label_es    varchar(100) NOT NULL,
    sort_order  smallint     NOT NULL DEFAULT 0,
    active_flag smallint     NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Motivo de rechazo
CREATE TABLE cat_rejection_reason (
    code        varchar(40)  PRIMARY KEY,
    label_es    varchar(120) NOT NULL,
    active_flag smallint     NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Canal de entrada
CREATE TABLE cat_channel (
    code        varchar(40)  PRIMARY KEY,
    label_es    varchar(100) NOT NULL,
    active_flag smallint     NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Tipo de evento del timeline de expediente
CREATE TABLE cat_event_type (
    code        varchar(50)  PRIMARY KEY,
    label_es    varchar(120) NOT NULL,
    active_flag smallint     NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Prioridad de next step
CREATE TABLE cat_next_step_priority (
    code        varchar(40)  PRIMARY KEY,
    label_es    varchar(60)  NOT NULL,
    sort_order  smallint     NOT NULL DEFAULT 0,   -- HIGH=1, MEDIUM=2, LOW=3
    active_flag smallint     NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Estado de next step
CREATE TABLE cat_next_step_status (
    code        varchar(40)  PRIMARY KEY,
    label_es    varchar(60)  NOT NULL,
    active_flag smallint     NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Estado de documento huerfano
CREATE TABLE cat_orphan_status (
    code        varchar(40)  PRIMARY KEY,
    label_es    varchar(60)  NOT NULL,
    active_flag smallint     NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Tipo de pregunta al LLM
CREATE TABLE cat_llm_question_type (
    code        varchar(40)  PRIMARY KEY,
    label_es    varchar(120) NOT NULL,
    active_flag smallint     NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- =============================================================================
-- 3. USUARIOS
-- =============================================================================
CREATE TABLE app_user (
    id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    email         varchar(255) NOT NULL,
    password_hash varchar(255) NOT NULL,
    full_name     varchar(255) NOT NULL,
    role_code     varchar(40)  NOT NULL DEFAULT 'INTERNAL' REFERENCES cat_user_role(code),
    active_flag   smallint     NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),
    created_by    uuid REFERENCES app_user(id),
    updated_by    uuid REFERENCES app_user(id)
);
-- email unico solo entre usuarios vigentes
CREATE UNIQUE INDEX ux_app_user_email_active ON app_user (lower(email)) WHERE active_flag = 1;

-- =============================================================================
-- 4. SECUENCIA DE CODIGO DE EXPEDIENTE
--    Formato: EXP-AAAA-{BLN|VNT}{NNNNN}-{XXXX}
--    Ej: EXP-2026-BLN00001-K7MQ. El contador NNNNN reinicia por (anio, tipo de
--    operacion). XXXX son 4 caracteres aleatorios de un alfabeto sin caracteres
--    confusos (sin 0/O, 1/I/L): hacen el codigo dificil de adivinar y resistente a
--    errores de tecleo (un codigo mal escrito casi nunca coincide con otro real, asi
--    cae a huerfanos en vez de asignarse al expediente equivocado). El codigo lo arma
--    el trigger fn_case_set_code (mas abajo).
-- =============================================================================
CREATE TABLE case_code_sequence (
    year        int          NOT NULL,
    op_code     varchar(40)  NOT NULL,
    last_number int          NOT NULL DEFAULT 0,
    PRIMARY KEY (year, op_code)
);

-- =============================================================================
-- 5. EXPEDIENTE (modulo core)
-- =============================================================================
CREATE TABLE case_file (
    id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    code                varchar(30)   NOT NULL,            -- EXP-AAAA-{BLN|VNT}#####-XXXX (autogenerado)
    -- Datos del cliente
    client_name         varchar(255)  NOT NULL,
    client_phone        varchar(30),
    client_email        varchar(255),
    client_rfc          varchar(13),
    client_curp         varchar(18),                       -- para emparejar huerfanos
    client_postal_code  varchar(10),                       -- para emparejar huerfanos
    client_identity_key varchar(64),                       -- clave normalizada derivada (matching)
    -- Datos de la operacion
    estimated_amount    numeric(14,2) NOT NULL CHECK (estimated_amount >= 0),
    operation_type_code varchar(40)   NOT NULL REFERENCES cat_operation_type(code),
    -- Estado / control
    status_code         varchar(40)   NOT NULL DEFAULT 'CAPTURING' REFERENCES cat_case_status(code),
    cancellation_reason text,
    assigned_user_id    uuid          REFERENCES app_user(id),
    -- Auditoria
    active_flag         smallint      NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at          timestamptz   NOT NULL DEFAULT now(),
    updated_at          timestamptz   NOT NULL DEFAULT now(),
    created_by          uuid REFERENCES app_user(id),
    updated_by          uuid REFERENCES app_user(id),
    -- motivo obligatorio si esta cancelado
    CONSTRAINT ck_case_cancel_reason
        CHECK (status_code <> 'CANCELLED' OR cancellation_reason IS NOT NULL)
);
CREATE UNIQUE INDEX ux_case_code ON case_file (code);
CREATE INDEX ix_case_status       ON case_file (status_code);
CREATE INDEX ix_case_assigned     ON case_file (assigned_user_id);
CREATE INDEX ix_case_created_at   ON case_file (created_at);
CREATE INDEX ix_case_rfc          ON case_file (client_rfc);
CREATE INDEX ix_case_curp         ON case_file (client_curp);
CREATE INDEX ix_case_postal       ON case_file (client_postal_code);
-- Busqueda parcial (trigram) para el buscador del dashboard
CREATE INDEX ix_case_name_trgm    ON case_file USING gin (client_name gin_trgm_ops);
CREATE INDEX ix_case_email_trgm   ON case_file USING gin (client_email gin_trgm_ops);
CREATE INDEX ix_case_phone_trgm   ON case_file USING gin (client_phone gin_trgm_ops);
CREATE INDEX ix_case_code_trgm    ON case_file USING gin (code gin_trgm_ops);

-- Trigger: autogenerar code si no viene.
-- Formato EXP-AAAA-{BLN|VNT}{NNNNN}-{XXXX}; el contador reinicia por (anio, tipo de
-- operacion) y XXXX son 4 caracteres aleatorios sin caracteres confusos.
CREATE OR REPLACE FUNCTION fn_case_set_code() RETURNS trigger AS $$
DECLARE
    v_year   int := EXTRACT(YEAR FROM now())::int;
    v_op     varchar(3);
    v_num    int;
    v_alpha  text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- sin 0,O,1,I,L (faciles de confundir)
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
$$ LANGUAGE plpgsql;
CREATE TRIGGER tg_case_set_code BEFORE INSERT ON case_file
    FOR EACH ROW EXECUTE FUNCTION fn_case_set_code();

-- =============================================================================
-- 6. DOCUMENTO (recibido y asociado a un expediente)
-- =============================================================================
CREATE TABLE document (
    id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    case_file_id         uuid          NOT NULL REFERENCES case_file(id),
    declared_type_code   varchar(40)   REFERENCES cat_document_type(code),  -- lo que dijo el remitente
    detected_type_code   varchar(40)   REFERENCES cat_document_type(code),  -- lo que devolvio Document API
    file_url             text          NOT NULL,
    channel_code         varchar(40)   NOT NULL REFERENCES cat_channel(code),
    sender               varchar(255),                                      -- telefono o correo
    extracted_data       jsonb,                                             -- JSON de Document API
    extraction_confidence numeric(5,2),                                     -- confianza promedio (0-100)
    issue_date           date,                                              -- fecha_emision extraida
    expiry_date          date,                                              -- fecha_vencimiento calculada
    status_code          varchar(40)   NOT NULL DEFAULT 'RECEIVED' REFERENCES cat_document_status(code),
    rejection_reason_code varchar(40)  REFERENCES cat_rejection_reason(code),
    rejection_note       text,
    is_auto_rejected     smallint      NOT NULL DEFAULT 0 CHECK (is_auto_rejected IN (0,1)),
    replaced_by_id       uuid          REFERENCES document(id),             -- version que lo sustituye
    file_purged_at       timestamptz,                                       -- cron borro el archivo de R2 (fila queda como auditoria)
    reception_at         timestamptz   NOT NULL DEFAULT now(),
    validated_by_id      uuid          REFERENCES app_user(id),
    validated_at         timestamptz,
    active_flag          smallint      NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at           timestamptz   NOT NULL DEFAULT now(),
    updated_at           timestamptz   NOT NULL DEFAULT now(),
    created_by           uuid REFERENCES app_user(id),
    updated_by           uuid REFERENCES app_user(id),
    CONSTRAINT ck_doc_rejection_reason
        CHECK (status_code <> 'REJECTED' OR rejection_reason_code IS NOT NULL)
);
CREATE INDEX ix_doc_case        ON document (case_file_id);
CREATE INDEX ix_doc_status      ON document (status_code);
CREATE INDEX ix_doc_decl_type   ON document (declared_type_code);
CREATE INDEX ix_doc_expiry      ON document (expiry_date);          -- crons de vencimiento
CREATE INDEX ix_doc_reception   ON document (reception_at);

-- =============================================================================
-- 7. CHECKLIST
-- =============================================================================
-- 7a. Plantilla (que documentos exige cada tipo de operacion). Permite cambiar
--     el checklist en v1 sin tocar codigo.
CREATE TABLE cat_checklist_template (
    operation_type_code varchar(40) NOT NULL REFERENCES cat_operation_type(code),
    document_type_code  varchar(40) NOT NULL REFERENCES cat_document_type(code),
    sort_order          smallint    NOT NULL DEFAULT 0,
    active_flag         smallint    NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    PRIMARY KEY (operation_type_code, document_type_code)
);

-- 7b. Checklist materializado por expediente (nunca desaparece, solo cambia de estado)
CREATE TABLE case_checklist_item (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    case_file_id        uuid        NOT NULL REFERENCES case_file(id),
    document_type_code  varchar(40) NOT NULL REFERENCES cat_document_type(code),
    status_code         varchar(40) NOT NULL DEFAULT 'PENDING' REFERENCES cat_checklist_status(code),
    current_document_id uuid        REFERENCES document(id),    -- doc vigente que lo cumple
    active_flag         smallint    NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid REFERENCES app_user(id),
    updated_by          uuid REFERENCES app_user(id),
    CONSTRAINT ux_checklist UNIQUE (case_file_id, document_type_code)
);
CREATE INDEX ix_checklist_case   ON case_checklist_item (case_file_id);
CREATE INDEX ix_checklist_status ON case_checklist_item (status_code);

-- =============================================================================
-- 8. NEXT STEPS (dinamicos)
-- =============================================================================
CREATE TABLE next_step (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    case_file_id   uuid        NOT NULL REFERENCES case_file(id),
    description    text        NOT NULL,
    priority_code  varchar(40) NOT NULL DEFAULT 'MEDIUM' REFERENCES cat_next_step_priority(code),
    status_code    varchar(40) NOT NULL DEFAULT 'PENDING' REFERENCES cat_next_step_status(code),
    resolved_at    timestamptz,
    active_flag    smallint    NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    created_by     uuid REFERENCES app_user(id),
    updated_by     uuid REFERENCES app_user(id)
);
CREATE INDEX ix_nextstep_case     ON next_step (case_file_id);
CREATE INDEX ix_nextstep_status   ON next_step (status_code);
CREATE INDEX ix_nextstep_priority ON next_step (priority_code);

-- =============================================================================
-- 9. NOTAS INTERNAS
-- =============================================================================
CREATE TABLE internal_note (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    case_file_id uuid        NOT NULL REFERENCES case_file(id),
    author_id    uuid        NOT NULL REFERENCES app_user(id),
    body         text        NOT NULL,
    active_flag  smallint    NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid REFERENCES app_user(id),
    updated_by   uuid REFERENCES app_user(id)
);
CREATE INDEX ix_note_case ON internal_note (case_file_id);

-- =============================================================================
-- 10. EVENTO DE EXPEDIENTE (timeline de negocio, append-only)
-- =============================================================================
CREATE TABLE case_event (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    case_file_id    uuid        NOT NULL REFERENCES case_file(id),
    event_type_code varchar(50) NOT NULL REFERENCES cat_event_type(code),
    description     text,
    actor           varchar(255),                         -- 'system' o email del usuario
    actor_user_id   uuid        REFERENCES app_user(id),
    metadata        jsonb,
    event_at        timestamptz NOT NULL DEFAULT now(),
    active_flag     smallint    NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid REFERENCES app_user(id),
    updated_by      uuid REFERENCES app_user(id)
);
CREATE INDEX ix_event_case ON case_event (case_file_id, event_at);
CREATE INDEX ix_event_type ON case_event (event_type_code);

-- =============================================================================
-- 11. DOCUMENTO HUERFANO (separado de DOCUMENT, como se decidio)
-- =============================================================================
CREATE TABLE orphan_document (
    id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    file_url                  text        NOT NULL,
    channel_code              varchar(40) NOT NULL REFERENCES cat_channel(code),
    sender                    varchar(255),
    message_text              text,
    extracted_data            jsonb,
    -- Campos extraidos para emparejar contra expedientes existentes (idea de Christopher)
    extracted_curp            varchar(18),
    extracted_rfc             varchar(13),
    extracted_postal_code     varchar(10),
    suggested_document_type_code varchar(40) REFERENCES cat_document_type(code),
    suggested_case_file_id    uuid        REFERENCES case_file(id),   -- match automatico propuesto
    status_code               varchar(40) NOT NULL DEFAULT 'PENDING' REFERENCES cat_orphan_status(code),
    assigned_case_file_id     uuid        REFERENCES case_file(id),   -- a donde se asigno
    resulting_document_id     uuid        REFERENCES document(id),    -- doc creado al asignar
    discard_reason            text,
    reception_at              timestamptz NOT NULL DEFAULT now(),
    active_flag               smallint    NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    created_by                uuid REFERENCES app_user(id),
    updated_by                uuid REFERENCES app_user(id)
);
CREATE INDEX ix_orphan_status ON orphan_document (status_code);
CREATE INDEX ix_orphan_curp   ON orphan_document (extracted_curp);
CREATE INDEX ix_orphan_rfc    ON orphan_document (extracted_rfc);

-- =============================================================================
-- 12. CONSULTA LLM (botones SAT / efectivo)
-- =============================================================================
CREATE TABLE llm_query (
    id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    case_file_id        uuid          NOT NULL REFERENCES case_file(id),
    question_type_code  varchar(40)   NOT NULL REFERENCES cat_llm_question_type(code),
    question_text       text,
    answer_bool         boolean,                          -- true=SI, false=NO
    answer_reason       text,                             -- razon breve (<=30 palabras)
    -- Snapshot de los datos al momento de preguntar (auditoria)
    amount_at_query     numeric(14,2),
    operation_type_code varchar(40)   REFERENCES cat_operation_type(code),
    raw_response        jsonb,
    query_at            timestamptz   NOT NULL DEFAULT now(),
    active_flag         smallint      NOT NULL DEFAULT 1 CHECK (active_flag IN (0,1)),
    created_at          timestamptz   NOT NULL DEFAULT now(),
    updated_at          timestamptz   NOT NULL DEFAULT now(),
    created_by          uuid REFERENCES app_user(id),
    updated_by          uuid REFERENCES app_user(id)
);
CREATE INDEX ix_llm_case ON llm_query (case_file_id);

-- =============================================================================
-- 13. TRIGGERS: updated_at + bitacora sobre tablas de negocio
-- =============================================================================
-- updated_at en todas las tablas con esa columna (incluye catalogos)
DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT c.table_name
        FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
    LOOP
        EXECUTE format(
            'CREATE TRIGGER tg_%1$s_updated_at BEFORE UPDATE ON %1$s
             FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();', r.table_name);
    END LOOP;
END $$;

-- bitacora solo sobre tablas de negocio (las que tienen columna id uuid)
DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT unnest(ARRAY[
            'app_user','case_file','document','case_checklist_item',
            'next_step','internal_note','case_event','orphan_document','llm_query'
        ]) AS t
    LOOP
        EXECUTE format(
            'CREATE TRIGGER tg_%1$s_audit AFTER INSERT OR UPDATE OR DELETE ON %1$s
             FOR EACH ROW EXECUTE FUNCTION fn_audit();', r.t);
    END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- 14. SEED DE CATALOGOS (datos de referencia)
-- =============================================================================
BEGIN;

INSERT INTO cat_user_role(code, label_es, description, sort_order) VALUES
    ('INTERNAL',           'Interno',                    'Rol unico del MVP', 1),
    ('CAPTURIST',          'Capturista',                 'v1', 2),
    ('REVIEWER',           'Revisor',                    'v1', 3),
    ('COMPLIANCE_OFFICER', 'Representante de Cumplimiento','v1', 4);

-- Umbrales LFPIORPI 2026 (UMA $117.31)
INSERT INTO cat_operation_type(code, label_es, lfpiorpi_fraction, identification_threshold, sat_report_threshold, cash_limit_threshold, sort_order) VALUES
    ('ARMORING',     'Blindaje de vehiculo', 'IX',   282717.10, 564847.65, 376565.10, 1),
    ('VEHICLE_SALE', 'Venta de vehiculo',    'VIII', 376565.10, 753130.20, 376565.10, 2);

INSERT INTO cat_case_status(code, label_es, sort_order, is_open, is_terminal) VALUES
    ('CAPTURING',          'En captura',        1, 1, 0),
    ('RECEIVING',          'En recepcion',      2, 1, 0),
    ('IN_VALIDATION',      'En validacion',     3, 1, 0),
    ('COMPLETE',           'Completo',          4, 1, 0),
    ('INCOMPLETE_EXPIRED', 'Incompleto vencido',5, 1, 0),
    ('CANCELLED',          'Cancelado',         6, 0, 1),
    ('ARCHIVED',           'Archivado',         7, 0, 1);

INSERT INTO cat_case_status_transition(from_code, to_code, label_es) VALUES
    ('CAPTURING','RECEIVING','Llega el primer documento'),
    ('CAPTURING','CANCELLED','Cancelacion'),
    ('RECEIVING','IN_VALIDATION','Documentos recibidos, a revision'),
    ('RECEIVING','INCOMPLETE_EXPIRED','Documento vencido'),
    ('RECEIVING','CANCELLED','Cancelacion'),
    ('IN_VALIDATION','COMPLETE','Validado'),
    ('IN_VALIDATION','RECEIVING','Rechazo, regresa a recepcion'),
    ('IN_VALIDATION','INCOMPLETE_EXPIRED','Documento vencido'),
    ('IN_VALIDATION','CANCELLED','Cancelacion'),
    ('INCOMPLETE_EXPIRED','RECEIVING','Reemplazo de documento vencido'),
    ('INCOMPLETE_EXPIRED','CANCELLED','Cancelacion'),
    ('COMPLETE','ARCHIVED','Archivar'),
    ('COMPLETE','INCOMPLETE_EXPIRED','Vence un documento ya validado');

INSERT INTO cat_document_type(code, label_es, is_checklist_item, validity_months, never_expires, expires_with_fiscal_year, uses_document_expiry, sort_order) VALUES
    ('OFFICIAL_ID',      'Identificacion oficial (INE/Pasaporte)', 1, NULL, 0, 0, 1, 1),
    ('CURP',             'CURP',                                   1, NULL, 1, 0, 0, 2),
    ('TAX_STATUS_CERT',  'Constancia de Situacion Fiscal',         1, NULL, 0, 1, 0, 3),
    ('PROOF_OF_ADDRESS', 'Comprobante de domicilio',               1, 3,    0, 0, 0, 4),
    ('OTHER',            'Otro',                                   0, NULL, 0, 0, 0, 9);

INSERT INTO cat_document_status(code, label_es, sort_order) VALUES
    ('PROCESSING','Procesando',  0),
    ('RECEIVED',  'Recibido',   1),
    ('VALIDATED', 'Validado',   2),
    ('REJECTED',  'Rechazado',  3),
    ('EXPIRED',   'Vencido',    4),
    ('REPLACED',  'Reemplazado',5);

INSERT INTO cat_checklist_status(code, label_es, sort_order) VALUES
    ('PENDING',   'Pendiente', 1),
    ('RECEIVED',  'Recibido',  2),
    ('VALIDATED', 'Validado',  3),
    ('REJECTED',  'Rechazado', 4),
    ('EXPIRED',   'Vencido',   5);

INSERT INTO cat_rejection_reason(code, label_es) VALUES
    ('ILLEGIBLE',     'Ilegible'),
    ('TYPE_MISMATCH', 'El tipo no coincide'),
    ('EXPIRED',       'Vencido'),
    ('OTHER',         'Otro');

INSERT INTO cat_channel(code, label_es) VALUES
    ('WHATSAPP',      'WhatsApp'),
    ('EMAIL',         'Correo'),
    ('DIRECT_UPLOAD', 'Upload directo');

INSERT INTO cat_event_type(code, label_es) VALUES
    ('CASE_CREATED',        'Expediente creado'),
    ('STATUS_CHANGED',      'Cambio de estado'),
    ('DOCUMENT_RECEIVED',   'Documento recibido'),
    ('DOCUMENT_VALIDATED',  'Documento validado'),
    ('DOCUMENT_REJECTED',   'Documento rechazado'),
    ('DOCUMENT_AUTO_REJECTED','Documento rechazado automaticamente'),
    ('AUTO_REJECT_REVERTED','Rechazo automatico revertido'),
    ('DOCUMENT_REPLACED',   'Documento reemplazado'),
    ('REMINDER_SENT',       'Recordatorio enviado'),
    ('INSTRUCTIONS_RESENT', 'Instrucciones reenviadas'),
    ('NOTE_ADDED',          'Nota agregada'),
    ('CASE_COMPLETED',      'Expediente validado/completo'),
    ('CASE_CANCELLED',      'Expediente cancelado'),
    ('CASE_ARCHIVED',       'Expediente archivado'),
    ('LLM_QUERY',           'Consulta al LLM'),
    ('ORPHAN_ASSIGNED',     'Asignacion desde huerfano');

INSERT INTO cat_next_step_priority(code, label_es, sort_order) VALUES
    ('HIGH',   'Alta',  1),
    ('MEDIUM', 'Media', 2),
    ('LOW',    'Baja',  3);

INSERT INTO cat_next_step_status(code, label_es) VALUES
    ('PENDING',  'Pendiente'),
    ('RESOLVED', 'Resuelto');

INSERT INTO cat_orphan_status(code, label_es) VALUES
    ('PENDING',   'Pendiente'),
    ('ASSIGNED',  'Asignado'),
    ('DISCARDED', 'Descartado');

INSERT INTO cat_llm_question_type(code, label_es) VALUES
    ('SAT_REPORT',   'Hay que avisar al SAT?'),
    ('CASH_PAYMENT', 'Se puede pagar en efectivo?');

-- Plantilla de checklist: persona fisica residente, ambos tipos de operacion
INSERT INTO cat_checklist_template(operation_type_code, document_type_code, sort_order)
SELECT ot.code, dt.code, dt.sort_order
FROM cat_operation_type ot
CROSS JOIN cat_document_type dt
WHERE dt.is_checklist_item = 1;

COMMIT;
