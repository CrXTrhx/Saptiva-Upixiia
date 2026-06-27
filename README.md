<div align="center">

```
 _  _      _  _        _  __       _
| || |_ _ (_)| |_____ (_)/ _|___  | |_ ___
| __ | '_|| || / / _ \| |  _/ _ \ | _/ _ \
|_||_|_|  |_||_\_\___/|_|_| \___/ |_|\___/

     digitalfoldr — Saptiva AML Platform
```

**Onboarding digital de clientes con validación automática de documentos KYC**

<br>

[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.138-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![Deploy](https://img.shields.io/badge/Deploy-Render-46E3B7?style=flat-square&logo=render&logoColor=black)](https://render.com/)

</div>

<br>

---

## ¿Qué es digitalfoldr?

**digitalfoldr** es una plataforma AML (Anti-Money Laundering) que digitaliza el proceso de recolección y validación de documentos KYC para instituciones financieras como CENTUR. Cuando un asesor registra una nueva venta, el sistema genera automáticamente un checklist de documentos requeridos, envía instrucciones al cliente por WhatsApp o correo, y valida los documentos recibidos usando Google Document AI.

Los documentos pueden llegar por **múltiples canales** (upload manual, WhatsApp, correo electrónico) y son clasificados y extraídos automáticamente. El asesor solo interviene cuando hay una discrepancia o el sistema no puede validar un documento con suficiente confianza.

<br>

| Componente | Tecnología | Propósito |
|------------|-----------|-----------|
| Frontend | Next.js 16 + React 19 | Interfaz del asesor |
| Backend | FastAPI + Python 3.12 | API REST + lógica de negocio |
| Base de datos | PostgreSQL 16 (Neon) | Persistencia con auditoría completa |
| Storage | Cloudflare R2 | Documentos con URLs firmadas |
| Document AI | Google Document AI | Clasificación y extracción automática |
| Email | Mailgun | Envío y recepción de documentos |
| Deploy | Render (Docker) | Backend en producción |

---

## ✨ Características

| Módulo | Descripción |
|--------|-------------|
| **Expedientes** | Máquina de estados: `CAPTURANDO → INCOMPLETO → COMPLETO → ARCHIVADO / CANCELADO` |
| **Pipeline de documentos** | 6 pasos automáticos: recepción → clasificación (DocAI) → extracción → validación → asignación → notificación |
| **Multicanal** | Ingesta por upload manual, webhook WhatsApp (Sinch) y webhook correo (Mailgun) |
| **Huérfanos** | Cola de documentos no emparejados; resolución por CURP/RFC |
| **Validación humana** | Revisor aprueba o rechaza documentos; el cliente puede reemplazar versiones |
| **Historial de versiones** | Cada reemplazo conserva las versiones anteriores con su estado |
| **Consulta LLM** | Botones "SAT" y "efectivo" consultan Claude (stub por defecto, activable con `LLM_USE_REAL=true`) |
| **Dashboard** | Conteos por estado y lista filtrable por búsqueda, estado, fecha, doc faltante |
| **Instrucciones al cliente** | Texto copy-paste personalizado con documentos pendientes y canales de entrega |
| **Crons** | Jobs de vencimiento próximo, vencimiento consumado e inactividad |
| **Auditoría** | Triggers `fn_audit` registran cada escritura con el usuario autor; soft-delete, nunca DELETE físico |
| **Storage seguro** | Cloudflare R2 con URLs firmadas (presigned); disco local en dev |

---

## 🏗️ Arquitectura

```
┌──────────────────────────────────────────────────────┐
│                     Monorepo                         │
│                                                      │
│   frontend/          backend/          database/     │
│   (Next.js 16)       (FastAPI)         (schema)      │
│   React 19           Python 3.12+                    │
│   Tailwind v4        SQLAlchemy 2.0                  │
│   TypeScript         psycopg3 + Alembic              │
└──────────┬───────────────────┬───────────────────────┘
           │                   │
      Vercel / Render       Render (Docker)
           │                   │
           └─────────┬─────────┘
                     │
         ┌───────────┼──────────────┐
         │           │              │
      Neon       Cloudflare     Google
   (Postgres)       R2          DocAI
```

**Flujo principal:**

```
Asesor registra venta
  → Backend genera expediente + checklist de documentos
  → Se envían instrucciones al cliente (WhatsApp / correo)
  → Cliente envía documentos por cualquier canal
  → Pipeline de 6 pasos: clasifica → extrae → valida → asigna
  → Asesor revisa y aprueba / rechaza
  → Expediente pasa a COMPLETO → ARCHIVADO
```

---

## 🚀 Inicio Rápido

### Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — levanta la BD y el backend
- [Node.js 20+](https://nodejs.org/) y `npm` — para el frontend
- Git

<br>

### Opción A — Docker Compose (recomendado para dev)

Levanta PostgreSQL + backend con un solo comando. El frontend se corre aparte.

**1. Clona el repo y configura las variables:**

```bash
git clone <url-del-repo>
cd Saptiva-Upixiia

# Configura las variables del backend
cp backend/.env.example backend/.env
# Edita backend/.env: agrega tu DATABASE_URL (Neon) y las llaves de DocAI, R2, etc.
# Para dev básico: STORAGE_BACKEND=local y LLM_USE_REAL=false son suficientes.
```

**2. Levanta la base de datos y el backend:**

```bash
docker compose up --build
```

> La primera vez Docker carga `database/schema/schema.sql` automáticamente, aplica las migraciones de Alembic y siembra el usuario admin.

**3. Verifica que esté corriendo:**

```bash
curl http://localhost:4000/health
# → {"status":"ok","db":true}
```

- Docs OpenAPI: `http://localhost:4000/docs`
- Admin por defecto: `admin@centur.com` / `admin123`

**4. Corre el frontend:**

```bash
cd frontend
npm install
cp .env.example .env.local
# .env.local ya apunta a http://localhost:4000/api por defecto
npm run dev
```

Abre `http://localhost:3000`.

<br>

### Opción B — Backend sin Docker (entorno virtual Python)

```bash
cd backend

# Windows
python -m venv .venv && .venv\Scripts\activate
# macOS / Linux
python -m venv .venv && source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Edita .env con tu DATABASE_URL de Neon

# Carga el esquema en Neon (solo la primera vez)
psql "<DATABASE_URL>" -f ../database/schema/schema.sql

# Marca baseline y aplica migraciones incrementales
python -m alembic stamp 0001_baseline
python -m alembic upgrade head

# Siembra el usuario admin
python -m app.seed

# Inicia la API
uvicorn app.main:app --reload --port 4000
```

---

## ⚙️ Configuración

### Backend — `backend/.env`

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `DATABASE_URL` | Connection string de Neon sin `-pooler` | ✅ |
| `JWT_SECRET` | Secreto largo y aleatorio para firmar tokens | ✅ |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credenciales del usuario admin inicial | ✅ |
| `CORS_ORIGINS` | Origen(es) del frontend separados por coma | ✅ |
| `STORAGE_BACKEND` | `local` (dev) o `r2` (prod) | ✅ |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Cloudflare R2 | Solo si `r2` |
| `GCP_PROJECT_ID`, `DOCAI_*`, `GOOGLE_APPLICATION_CREDENTIALS` | Google Document AI | Solo si DocAI real |
| `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_SIGNING_KEY` | Correo saliente + webhooks entrantes | Opcional |
| `LLM_USE_REAL` | `false` (stub) o `true` (Claude real) | — |
| `ANTHROPIC_API_KEY` | Requerida si `LLM_USE_REAL=true` | Opcional |

### Frontend — `frontend/.env.local`

| Variable | Descripción |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | URL base del backend, ej. `http://localhost:4000/api` |
| `NEXT_PUBLIC_SYSTEM_EMAIL` | Correo al que el cliente envía documentos |
| `NEXT_PUBLIC_SYSTEM_WHATSAPP` | Número de WhatsApp del sistema |

---

## 📖 Endpoints de la API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Login JWT |
| `GET` | `/api/auth/me` | Perfil del usuario |
| `POST` | `/api/expedientes` | Crear expediente |
| `GET` | `/api/expedientes` | Lista con filtros y prioridad |
| `GET` | `/api/expedientes/{id}/detalle` | Checklist, docs, next steps, historial |
| `PATCH` | `/api/expedientes/{id}/completar` | Cambio de estado |
| `POST` | `/api/expedientes/{id}/documentos` | Upload manual (multipart) |
| `PATCH` | `/api/documentos/{id}/validar` | Aprobar documento |
| `PATCH` | `/api/documentos/{id}/rechazar` | Rechazar documento |
| `POST` | `/api/documentos/{id}/reemplazar` | Nueva versión del documento |
| `GET` | `/api/huerfanos` | Cola de documentos sin expediente |
| `POST` | `/api/huerfanos/{id}/asignar` | Asignar huérfano a expediente |
| `POST` | `/api/webhooks/whatsapp` | Webhook de Sinch (sin JWT) |
| `POST` | `/api/webhooks/email` | Webhook de Mailgun (sin JWT) |

> Documentación interactiva completa: `http://localhost:4000/docs`

---

## 🧪 Tests

```bash
cd backend

# Tests unitarios (sin base de datos)
pytest tests/test_unit.py

# Smoke end-to-end (requiere la API corriendo en :4000)
python -m tests.smoke
```

El smoke recorre los 16 pasos del guion de aceptación: login → nueva venta → ingesta de docs → rechazo + reemplazo → consulta LLM → completar → huérfano → cancelar.

---

## 🚢 Deploy en producción

| Capa | Servicio | Notas |
|------|----------|-------|
| Backend | Render (Docker) | `render.yaml` en la raíz, blueprint automático |
| Base de datos | Neon | PostgreSQL 16 serverless, connection string directo (sin `-pooler`) |
| Storage | Cloudflare R2 | Bucket privado, URLs firmadas |
| Frontend | Vercel o Render | `Root Directory: frontend` |

### Pasos rápidos

```bash
# 1. Sube el repo a GitHub
git push origin main

# 2. En Render: New + → Blueprint → conecta el repo
#    Render detecta render.yaml y crea el servicio digitalfoldr-backend

# 3. Completa las variables secretas en el dashboard de Render
#    (DATABASE_URL, JWT_SECRET, R2_*, DOCAI_*, MAILGUN_*, etc.)

# 4. Carga el Secret File del Document AI
#    Render → Environment → Secret Files → document-ai-service-account.json

# 5. Verifica el deploy
curl https://<tu-servicio>.onrender.com/health
# → {"status":"ok","db":true}
```

> Guía completa paso a paso: [`backend/DEPLOY_RENDER.md`](backend/DEPLOY_RENDER.md)

---

## 📁 Estructura del proyecto

```
digitalfoldr/
├── docker-compose.yml           # Levanta PostgreSQL 16 + backend para dev
├── render.yaml                  # Blueprint de deploy en Render
├── database/
│   └── schema/schema.sql        # Schema PostgreSQL 16 completo (fuente de verdad)
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic/                 # Migraciones (baseline = schema.sql)
│   └── app/
│       ├── main.py              # Punto de entrada FastAPI
│       ├── core/                # Config, DB, JWT/bcrypt, errores
│       ├── models/              # SQLAlchemy mapeado al schema
│       ├── schemas/             # Pydantic v2 (camelCase via alias)
│       ├── modules/
│       │   ├── auth/            # Login JWT + /auth/me
│       │   ├── expedientes/     # State machine + motor de next steps
│       │   ├── documentos/      # Pipeline de 6 pasos
│       │   ├── huerfanos/       # Cola + matching CURP/RFC
│       │   ├── canales/         # Webhooks WhatsApp/correo
│       │   ├── llm/             # Consulta LLM (SAT/efectivo)
│       │   └── dashboard/       # Conteos por estado
│       ├── integrations/        # Adaptadores stub: R2, DocAI, Sinch, Mailgun, Anthropic
│       └── crons/               # Jobs de vencimiento e inactividad
└── frontend/
    ├── app/
    │   ├── login/               # Pantalla de login
    │   ├── dashboard/           # Lista de expedientes con filtros
    │   ├── expedientes/[id]/    # Detalle del expediente
    │   ├── nueva-venta/         # Formulario de nueva venta
    │   └── huerfanos/           # Cola de documentos huérfanos
    ├── lib/                     # Types, API client, reglas de negocio
    ├── services/                # authService, expedientesService, huerfanosService
    └── context/AuthContext.tsx  # Contexto de autenticación JWT
```

---

## 🤝 Contribuir

Ver [`CONTRIBUTING.md`](CONTRIBUTING.md) para el flujo completo.

**Resumen:**

1. Abre un issue describiendo el cambio antes de empezar
2. Crea una rama desde `main`: `git checkout -b feature/mi-feature`
3. Haz tus cambios respetando las reglas del proyecto
4. Asegúrate de que el smoke pasa: `python -m tests.smoke`
5. Abre un Pull Request contra `main`

**Reglas obligatorias:**
- Los secretos van solo en `.env` — nunca en el repo
- Soft-delete obligatorio: no usar `DELETE` físico en ninguna tabla
- Los códigos de catálogo van en inglés (`CAPTURING`, `OFFICIAL_ID`, etc.)
- Rotar las credenciales antes de cualquier demo o deploy público

---

## 📄 Licencia

Proyecto privado — CENTUR / Saptiva. Todos los derechos reservados.
