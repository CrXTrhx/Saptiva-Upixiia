# digitalfoldr — Frontend

Interfaz web del sistema de onboarding AML, construida con **Next.js 16 + React 19 + TypeScript + Tailwind CSS v4**.

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)

---

## Requisitos

- Node.js 20+
- El backend corriendo en `http://localhost:4000` (ver [`docker-compose.yml`](../docker-compose.yml) en la raíz)

---

## Instalación y desarrollo

```bash
# Desde la raíz del monorepo:
cd frontend

npm install

# Configura las variables de entorno
cp .env.example .env.local
# Edita .env.local si el backend corre en otro puerto/host

npm run dev
```

Abre `http://localhost:3000`.

---

## Variables de entorno

| Variable | Valor por defecto | Descripción |
|----------|------------------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api` | URL base del backend |
| `NEXT_PUBLIC_SYSTEM_EMAIL` | `documentos@mg.digitalfoldr.com` | Correo al que el cliente envía docs |
| `NEXT_PUBLIC_SYSTEM_WHATSAPP` | `+52 55 0000 0000` | WhatsApp del sistema |

---

## Scripts

```bash
npm run dev      # Servidor de desarrollo con hot-reload
npm run build    # Build de producción
npm run start    # Sirve el build de producción
npm run lint     # ESLint
```

---

## Páginas

| Ruta | Descripción |
|------|-------------|
| `/login` | Autenticación JWT |
| `/dashboard` | Lista de expedientes con filtros y conteos |
| `/expedientes/[id]` | Detalle: checklist, documentos, historial, notas |
| `/expedientes/[id]/instrucciones` | Texto de instrucciones para el cliente |
| `/expedientes/nuevo` | Formulario de nueva venta |
| `/nueva-venta` | Flujo alternativo de nueva venta |
| `/huerfanos` | Cola de documentos sin expediente |

---

## Estructura

```
frontend/
├── app/                    # App Router de Next.js
│   ├── layout.tsx          # Layout raíz con AuthProvider
│   ├── page.tsx            # Redirect a /dashboard o /login
│   ├── login/
│   ├── dashboard/
│   ├── expedientes/[id]/
│   ├── nueva-venta/
│   └── huerfanos/
├── context/
│   └── AuthContext.tsx     # Estado de sesión + token JWT
├── lib/
│   ├── api.ts              # Helpers de fetch con auth header
│   ├── apiClient.ts        # Cliente HTTP centralizado
│   ├── types.ts            # Tipos compartidos
│   ├── reglas-negocio.ts   # Lógica de next-steps y validaciones del cliente
│   └── status.ts           # Labels y colores de estados
└── services/
    ├── authService.ts
    ├── expedientesService.ts
    └── huerfanosService.ts
```

---

## Deploy

El frontend se deploya en **Cloudflare Pages**.

```
# En el dashboard de Cloudflare → Workers & Pages → Create → Pages
# Conecta el repo de GitHub y configura:
#   Root directory:   frontend
#   Build command:    npm run build
#   Framework preset: Next.js
```

Variables de entorno en Cloudflare Pages (Settings → Environment variables):
- `NEXT_PUBLIC_API_URL=https://<tu-backend>.onrender.com/api`
- `NEXT_PUBLIC_SYSTEM_EMAIL=documentos@mg.digitalfoldr.com`
- `NEXT_PUBLIC_SYSTEM_WHATSAPP=+52 55 0000 0000`

> Después de deployar el frontend, agrega su dominio (`https://<proyecto>.pages.dev` o el dominio custom) a `CORS_ORIGINS` en el backend (ver [`../backend/DEPLOY_RENDER.md`](../backend/DEPLOY_RENDER.md)).

---

## Sistema visual y de motion

Las convenciones de UI viven en [`DESIGN.md`](DESIGN.md): tokens de color/radius y
la spec de **Motion & Microinteractions** (duraciones, easing, specs por
componente y `prefers-reduced-motion`). Los tokens se consumen desde
[`app/globals.css`](app/globals.css) (CSS) y [`lib/motion.ts`](lib/motion.ts)
(framer-motion).

---

## Notas de la versión de Next.js

Este proyecto usa **Next.js 16** con el App Router. Las APIs y convenciones de esta versión pueden diferir de versiones anteriores — revisar la documentación oficial antes de agregar código nuevo.
