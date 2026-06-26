# Saptiva AML — Backend (FastAPI)

API REST que consume el frontend. Python + FastAPI + SQLAlchemy 2.0 (síncrono,
psycopg3) sobre PostgreSQL en **Neon**. Solo expone la API; las integraciones
externas (Document API de Saptiva, Sinch WhatsApp, correo entrante, LLM Anthropic)
están como **adaptadores stub** detrás de interfaces, listas para conectar después.

## Stack y decisiones

- **FastAPI + Pydantic v2** — requests/responses en camelCase (alias), errores `{message}`.
- **SQLAlchemy 2.0 síncrono + psycopg3** (`postgresql+psycopg://`), conexión directa de Neon.
- **Códigos de catálogo en inglés** (`CAPTURING`, `OFFICIAL_ID`, `WHATSAPP`…) servidos tal cual; el frontend los consume directamente.
- **Auditoría**: cada escritura inyecta el usuario con `set_audit_user` / `db_session` para que los triggers `fn_audit` registren el autor. Lecturas filtran `active_flag = 1` (soft-delete, nunca DELETE físico).
- **Storage**: Cloudflare R2 (S3-compatible) en prod; disco local (`./storage_local`, servido en `/files`) en dev. `document.file_url` guarda la URL, no los bytes.

## Estructura

```
app/
  core/        config, db (engine + db_session + ping), deps, security (JWT/bcrypt), errors, codes
  models/      SQLAlchemy mapeado al schema.sql existente
  schemas/     base camelCase
  modules/
    auth/        login JWT + /auth/me
    expedientes/ state_machine, next_steps (motor), serializers, service, router
    documentos/  ingesta (pipeline), validar/rechazar/reemplazar
    pipeline/    runner + steps (6 pasos independientes)
    huerfanos/   cola + matching (curp/rfc) + asignar/crear/descartar
    canales/     codigo_extractor + webhooks whatsapp/email (stub)
    llm/         umbrales (cat_operation_type) + servicio (botones SAT/efectivo)
  integrations/  storage (R2/local), document_api, sinch, email, anthropic_client (todos stub)
  crons/         jobs.py (vencimiento_proximo, vencimiento_consumado, inactividad)
  seed.py        crea el usuario admin
alembic/         baseline = schema.sql ; migraciones incrementales (0002+)
tests/           unit (pytest) + smoke end-to-end
```

## Puesta en marcha

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate      # Windows; en Unix: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                                 # pega el DATABASE_URL real de Neon
```

**1) Cargar el esquema en Neon (una sola vez):** pega `database/schema/schema.sql` en el
SQL Editor de Neon y córrelo (o `psql "<DATABASE_URL>" -f ../database/schema/schema.sql`).

**2) Marcar baseline y aplicar migraciones:**
```bash
python -m alembic stamp 0001_baseline
python -m alembic upgrade head        # agrega file_name/mime_type a document/orphan_document
```

**3) Crear el usuario admin y levantar la API:**
```bash
python -m app.seed                     # admin@centur.com / admin123 (configurable en .env)
uvicorn app.main:app --reload --port 4000
```

- Health: `GET http://localhost:4000/health` → `{"status":"ok","db":true}`
- Docs OpenAPI: `http://localhost:4000/docs`
- El frontend debe apuntar con `NEXT_PUBLIC_API_URL=http://localhost:4000/api`.

## Crons (PRD §6)

```bash
python -m app.crons.jobs vencimiento_proximo
python -m app.crons.jobs vencimiento_consumado
python -m app.crons.jobs inactividad
python -m app.crons.jobs all
```
En Railway se programan como cron jobs diarios.

## Tests

```bash
pytest tests/test_unit.py            # unit (sin BD)
python -m tests.smoke                # end-to-end (requiere la API corriendo en :4000)
```
El smoke recorre los 16 pasos del guion de aceptación del PRD (§11): login → crear venta
($700K blindaje) → ingestar docs por WhatsApp/correo/upload → rechazo automático + reemplazo
con histórico → consulta LLM (SAT=sí / efectivo=no) → completar → huérfano asignado → cancelar.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login, devuelve `{success, user, token}` |
| GET | `/api/auth/me` | Perfil del usuario actual |
| POST | `/api/expedientes` | Crear expediente (genera código + checklist) |
| GET | `/api/expedientes` | Lista filtrable (`search,estado,desde,hasta,doc_faltante`), ordenada por prioridad |
| GET | `/api/expedientes/conteos` | Conteo por estado |
| GET | `/api/expedientes/{id}` | Expediente (item de lista) |
| GET | `/api/expedientes/{id}/detalle` | Detalle: checklist, documentos, next steps, historial, notas |
| GET | `/api/expedientes/{id}/instrucciones` | Texto copy-paste para el cliente |
| PATCH | `/api/expedientes/{id}/completar` \| `/archivar` \| `/cancelar` | Cambios de estado |
| POST | `/api/expedientes/{id}/documentos` | Upload manual (multipart) |
| POST | `/api/expedientes/{id}/reenviar-instrucciones` | Reenvío (stub canal) |
| POST | `/api/expedientes/{id}/notas` | Nota interna |
| POST | `/api/expedientes/{id}/consulta-llm` | Botones SAT / efectivo |
| PATCH | `/api/documentos/{id}/validar` \| `/rechazar` | Validación humana |
| POST | `/api/documentos/{id}/reemplazar` | Nueva versión (multipart) |
| GET | `/api/huerfanos` \| `/huerfanos/count` | Cola de huérfanos |
| POST | `/api/huerfanos/{id}/asignar` \| `/crear-expediente` \| `/descartar` | Resolución |
| POST | `/api/webhooks/whatsapp` \| `/webhooks/email` | Entrada de canales (stub, sin JWT) |

## Seguridad

JWT (Bearer) en todo `/api/*` salvo `login` y webhooks; webhooks validan firma del proveedor
(stub por ahora). Contraseñas con bcrypt. Secretos solo por `.env` (gitignored). CORS por
allowlist. Validación de uploads (tamaño/no vacío). Pydantic + ORM parametrizado.

> ⚠️ El `DATABASE_URL` de Neon usado en desarrollo quedó expuesto en chat: **rotar la contraseña**
> en Neon antes de cualquier despliegue y manejarla solo vía `.env`.

## Conectar las integraciones reales (siguiente fase)

Cada adaptador en `app/integrations/` define la firma; basta implementar el cuerpo y poner las
credenciales en `.env`:
- `document_api.py` → API real de adjudicator.saptiva.com.
- `sinch.py` → WhatsApp (descarga de media + envío + verificación de firma).
- `email.py` → proveedor de correo entrante/saliente.
- `anthropic_client.py` → poner `LLM_USE_REAL=true` + `ANTHROPIC_API_KEY` (usa `claude-opus-4-8`).
- `storage.py` → poner `STORAGE_BACKEND=r2` + credenciales `R2_*`.
