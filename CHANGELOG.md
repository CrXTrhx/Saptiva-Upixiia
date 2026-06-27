<div align="center">

# Changelog — digitalfoldr

Todos los cambios notables de este proyecto se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

</div>

<br>

---

## [Sin versión publicada] — En desarrollo

> El proyecto está en fase de MVP activo. Los cambios se registrarán aquí a partir del primer release etiquetado.

---

## Historial de hitos (pre-release)

### 2026-06 — MVP funcional en Render

- **Deploy**: backend FastAPI en Render vía Docker + Neon (PostgreSQL 16) + Cloudflare R2
- **Módulos activos**: auth, expedientes, documentos, huérfanos, canales, dashboard, LLM (stub)
- **Pipeline de documentos**: clasificación y extracción automática con Google Document AI
- **Correo**: integración con Mailgun (envío de confirmaciones + webhook de correo entrante)
- **Frontend**: Next.js 16 + React 19 + Tailwind v4 conectado al backend en producción

### 2026-05 — Funcionalidades core

- Máquina de estados de expedientes con motor de next-steps
- Cola de documentos huérfanos con matching por CURP/RFC
- Historial de versiones de documentos con reemplazo
- Crons: vencimiento próximo, vencimiento consumado, inactividad
- Auditoría completa con triggers `fn_audit` en PostgreSQL

### 2026-04 — Estructura inicial

- Monorepo con `docker-compose.yml` para dev local
- Schema PostgreSQL 16 como fuente de verdad con Alembic baseline
- Adaptadores stub para todas las integraciones externas (DocAI, Sinch, Mailgun, Anthropic)
- Autenticación JWT con bcrypt

---

## Próximas versiones (roadmap)

| Feature | Estado |
|---------|--------|
| Activar integraciones reales (Sinch WhatsApp, LLM Anthropic) | Planeado |
| Tests de integración con BD real | Planeado |
| Panel de administración de usuarios | Planeado |
| Notificaciones en tiempo real (WebSocket) | Planeado |
| Setup de procesadores Google Document AI documentado | Planeado |

---

> Los releases numerados comenzarán a registrarse aquí a partir de `v1.0.0`.
