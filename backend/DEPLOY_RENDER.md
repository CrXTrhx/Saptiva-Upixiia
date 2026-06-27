# Deploy del backend en Render

Guía paso a paso para deployar el backend (FastAPI) en [Render](https://render.com)
usando **Docker**. La base de datos es **Neon** (externa), el storage es **Cloudflare
R2**, y las integraciones son **Google Document AI** y **Mailgun** — todo por variables
de entorno.

> El repo ya quedó listo: `Dockerfile` + `docker-entrypoint.sh` (usa `$PORT` de Render),
> y `render.yaml` (blueprint) en la raíz. Esta guía explica los pasos en el dashboard.

---

## Arquitectura del deploy

```
            ┌─────────────────────────── Render (web service, Docker) ───────────────┐
Frontend ─▶ │  uvicorn app.main:app  →  migraciones (alembic) + seed admin al iniciar │
            └──────┬───────────────┬──────────────┬───────────────┬──────────────────┘
                   │               │              │               │
              Neon (Postgres)  Cloudflare R2  Google DocAI     Mailgun
              DATABASE_URL     R2_* env vars  Secret File JSON  MAILGUN_* env vars
```

- Render expone el servicio en `https://<nombre>.onrender.com`.
- La API queda bajo `https://<nombre>.onrender.com/api/...` y la salud en `/health`.

---

## Paso 0 — Seguridad: rota los secretos (IMPORTANTE)

Las credenciales actuales (contraseña de Neon, llaves de R2, API key de Mailgun)
**aparecieron en texto plano durante el desarrollo/chat**. Antes de poner esto frente
a inversionistas, conviene **rotarlas**:

- **Neon**: Dashboard → tu proyecto → *Roles* → resetear contraseña → nuevo `DATABASE_URL`.
- **Cloudflare R2**: *Manage R2 API Tokens* → crea token nuevo → reemplaza `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`.
- **Mailgun**: *Settings → API Keys* → regenera la Private API key.
- **JWT_SECRET**: usa uno largo y aleatorio nuevo (p. ej. `openssl rand -hex 32`).

> Si no rotas, igual funciona, pero quedan secretos expuestos. Recomendado rotar.

---

## Prerrequisitos

1. El repo subido a **GitHub** (Render se conecta a GitHub/GitLab).
2. La base de datos **Neon** ya tiene el esquema cargado (este proyecto ya lo tiene).
   *Si fuera una Neon nueva*: carga primero `database/schema/schema.sql` en el SQL Editor de Neon.
3. El **bucket R2** existe (`upiixia`) y tienes su token.
4. Los **procesadores de Document AI** creados (classifier + 4 extractors) y el **JSON del service account**.
5. El **dominio de Mailgun** verificado (`mg.digitalfoldr.com`).

---

## Paso 1 — Subir el repo a GitHub

Desde la raíz del proyecto:

```bash
git add .
git commit -m "Backend listo para deploy en Render"
git push origin main
```

> El `.env` y el `*-service-account.json` están en `.gitignore`: **no se suben** (correcto).

---

## Paso 2 — Crear el servicio en Render (con el blueprint)

1. Entra a [dashboard.render.com](https://dashboard.render.com) → **New +** → **Blueprint**.
2. Conecta tu cuenta de GitHub y elige este repositorio.
3. Render detecta `render.yaml` y propone crear el servicio **saptiva-backend** (Docker).
4. Dale **Apply**. Render empezará el primer build (tarda unos minutos).

> **Alternativa sin blueprint (manual):** New + → **Web Service** → conecta el repo →
> Language: **Docker** → **Root Directory:** `backend` → Health Check Path: `/health`.
> Luego agrega las variables del Paso 3 a mano.

---

## Paso 3 — Variables de entorno

En el servicio → pestaña **Environment**. Las que tienen valor fijo ya vienen en
`render.yaml`; las **secretas** (marcadas abajo) las pegas tú (cópialas de tu
`backend/.env` local, o de los valores ya rotados en el Paso 0).

| Variable | Valor | ¿Secreta? |
|---|---|---|
| `DATABASE_URL` | string DIRECTO de Neon (`...neon.tech/neondb?sslmode=require`, **sin** `-pooler`) | ✅ pegar |
| `JWT_SECRET` | aleatorio largo | ✅ pegar |
| `JWT_EXPIRE_MINUTES` | `480` | fijo |
| `ADMIN_EMAIL` | `admin@centur.com` | fijo |
| `ADMIN_PASSWORD` | la que quieras para el admin | ✅ pegar |
| `ADMIN_NAME` | `Administrador` | fijo |
| `CORS_ORIGINS` | URL del frontend (ver Paso 7). Provisional: `https://<algo>.vercel.app` | ✅ pegar |
| `SYSTEM_WHATSAPP` | `+52 55 0000 0000` | fijo |
| `SYSTEM_EMAIL` | `documentos@mg.digitalfoldr.com` | fijo |
| `STORAGE_BACKEND` | `r2` | fijo |
| `RETENCION_REEMPLAZOS_DIAS` | `7` | fijo |
| `RETENCION_OTHER_DIAS` | `1` | fijo |
| `R2_ACCOUNT_ID` | de Cloudflare | ✅ pegar |
| `R2_ACCESS_KEY_ID` | de Cloudflare | ✅ pegar |
| `R2_SECRET_ACCESS_KEY` | de Cloudflare | ✅ pegar |
| `R2_BUCKET` | `upiixia` | ✅ pegar |
| `R2_PUBLIC_BASE_URL` | `https://<account>.r2.cloudflarestorage.com/` | ✅ pegar |
| `GCP_PROJECT_ID` | `upiixia-saptiva` | ✅ pegar |
| `DOCAI_LOCATION` | `us` | fijo |
| `DOCAI_CLASSIFIER_ID` | id del classifier | ✅ pegar |
| `DOCAI_EXTRACTOR_OFFICIAL_ID` | id extractor INE | ✅ pegar |
| `DOCAI_EXTRACTOR_CURP` | id extractor CURP | ✅ pegar |
| `DOCAI_EXTRACTOR_TAX_STATUS` | id extractor CSF | ✅ pegar |
| `DOCAI_EXTRACTOR_PROOF_ADDRESS` | id extractor comprobante | ✅ pegar |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/etc/secrets/document-ai-service-account.json` | fijo (ver Paso 4) |
| `MAILGUN_API_KEY` | Private API key de Mailgun | ✅ pegar |
| `MAILGUN_DOMAIN` | `mg.digitalfoldr.com` | fijo |
| `MAIL_FROM` | `Upiixia <noreply@mg.digitalfoldr.com>` | fijo |
| `MAILGUN_BASE_URL` | `https://api.mailgun.net` | fijo |
| `MAILGUN_SIGNING_KEY` | HTTP webhook signing key de Mailgun | ✅ pegar |
| `LLM_USE_REAL` | `false` | fijo |
| `EXTRACTION_CONFIDENCE_THRESHOLD` | `70` | fijo |

> Para LLM real (botones SAT/efectivo): pon `LLM_USE_REAL=true` y agrega `ANTHROPIC_API_KEY`.

---

## Paso 4 — Secret File del Document AI

El backend lee el JSON del service account desde la ruta de `GOOGLE_APPLICATION_CREDENTIALS`.
En Render **no se sube por git** — se carga como *Secret File*:

1. Servicio → **Environment** → sección **Secret Files** → **Add Secret File**.
2. **Filename:** `document-ai-service-account.json`
3. **Contents:** pega el contenido completo de tu archivo local
   `backend/document-ai-service-account.json`.
4. Guarda. Render lo monta en `/etc/secrets/document-ai-service-account.json`
   (que es justo lo que apunta `GOOGLE_APPLICATION_CREDENTIALS`).

---

## Paso 5 — Deploy y verificación

Tras guardar variables + secret file, Render hace deploy automático. Cuando esté **Live**:

```bash
# Salud (debe responder {"status":"ok","db":true})
curl https://<tu-servicio>.onrender.com/health

# Login (debe devolver token)
curl -X POST https://<tu-servicio>.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@centur.com","password":"<ADMIN_PASSWORD>"}'
```

- Docs OpenAPI: `https://<tu-servicio>.onrender.com/docs`
- Revisa los **Logs** en Render: deberías ver
  `[entrypoint] Base de datos lista` → `Aplicando migraciones` → `Sembrando usuario admin`
  → `Iniciando API en http://0.0.0.0:10000`.

---

## Paso 6 — Mailgun (envío + recepción)

**Saliente** (confirmaciones al cliente): funciona en cuanto `MAILGUN_API_KEY` + `MAILGUN_DOMAIN`
+ `MAIL_FROM` estén puestos. El botón "enviar correo" ya manda vía la API de Mailgun.

**Entrante** (recibir documentos del cliente por correo): en Mailgun configura una **Route**
que haga POST al webhook **con la nueva URL pública de Render**:

1. Mailgun → **Receiving → Routes → Create Route**.
2. Expression: por ejemplo `match_recipient("documentos@mg.digitalfoldr.com")`.
3. Action: **Store and notify** → `https://<tu-servicio>.onrender.com/api/webhooks/email`.
4. Asegúrate de que `MAILGUN_SIGNING_KEY` esté en Render para validar la firma.

> Si tenías la Route apuntando a otra URL (ngrok/local), actualízala a la de Render.

---

## Paso 7 — Apuntar el frontend (después)

Cuando deployes el frontend, ponle `NEXT_PUBLIC_API_URL=https://<tu-servicio>.onrender.com/api`
y agrega su dominio a `CORS_ORIGINS` del backend (puedes poner varios separados por coma,
p. ej. `https://miapp.vercel.app,http://localhost:3000`). Guardar dispara un redeploy.

---

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| Build falla en `pip install` | red/cuota | reintenta el deploy |
| `502`/no arranca | no bindeó a `$PORT` | confirma que el entrypoint usa `${PORT}` (ya está) |
| `/health` da `db:false` | `DATABASE_URL` mal o Neon dormida | revisa el string DIRECTO (sin `-pooler`); Neon free se despierta sola |
| Document AI: `No se pudo clasificar` | Secret File ausente o ruta mal | revisa el Secret File y `GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/...` |
| Correo no sale | falta `MAILGUN_API_KEY`/`MAILGUN_DOMAIN` | sin ellos cae a stub (solo imprime) |
| CORS bloquea al frontend | `CORS_ORIGINS` no incluye su dominio | agrega el dominio exacto (con https) |
| Primer request lento | plan `free` se duerme | usa plan `starter` (no se duerme) |

> Nota: el backend corre migraciones (`alembic upgrade head`) y siembra el admin **en cada
> arranque**; ambas operaciones son idempotentes, así que es seguro reiniciar/redeployar.
