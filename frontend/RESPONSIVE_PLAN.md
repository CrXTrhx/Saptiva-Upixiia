# RESPONSIVE_PLAN.md — Plan de adaptación responsive (tablet + teléfono)

> Objetivo: que la experiencia sea **excelente desde cualquier dispositivo**, con una
> versión adaptada por tamaño (no un único reflow). **No se crea ninguna UI ni feature
> nueva**: solo se **redistribuye** lo que ya existe por breakpoint, consumiendo los
> tokens y patrones actuales (`DESIGN.md`, `app/globals.css`, `lib/motion.ts`).

Stack: Next.js 16 · React 19 · Tailwind v4 · framer-motion 12 · lucide-react.

---

## Decisiones tomadas

- **Navegación en teléfono:** menú colapsable (popover accesible con ícono). Solo se
  reubican los items existentes (Cola de Huérfanos, usuario, Salir); no se agregan
  destinos nuevos.
- **Modales largos en teléfono:** hoja inferior (bottom-sheet) con esquinas redondeadas
  arriba, header sticky y cuerpo con scroll interno. En tablet/desktop: comportamiento
  centrado actual.
- **Entrega:** este documento primero; luego implementación por fases.

---

## Diagnóstico del estado actual (medido contra el código)

**Ya correcto (usar como patrón de referencia):**
- `components/dashboard/ContadoresEstado.tsx` → `grid-cols-2 sm:grid-cols-4 lg:grid-cols-7`. Mobile-first correcto.
- `components/dashboard/TablaExpedientes.tsx` → **doble render**: tabla-grid con `overflow-x-auto` en `sm+` y **lista de tarjetas en `sm:hidden`**. Patrón ganador a replicar.
- `components/dashboard/TablaClientes.tsx` → oculta/reordena columnas (`lg:flex` / `lg:hidden`).
- `app/login/page.tsx` + `LoginForm` → `max-w-md` centrado, ya responsive.

**Rompe o degrada en tablet/teléfono (núcleo del trabajo):**
- Solo ~47 ocurrencias de breakpoints en toda la app, mal distribuidas.
- `app/expedientes/[id]/page.tsx` (1997 líneas): header sticky con toolbar horizontal y
  **padding fijo `px-6`** (no `px-4 sm:px-6`); ficha `grid-cols-2 md:grid-cols-3`; cuerpo
  `lg:grid-cols-12`. En teléfono el toolbar se apretuja y hay overflow lateral. Usa **hex
  inline** en vez de tokens en muchos sitios.
- `components/ui/Modal.tsx` → `max-w-lg w-full mx-4 p-6` sin `max-height`, sin scroll
  interno, sin tratamiento móvil. Modales largos desbordan en teléfono.
- `components/dashboard/DashboardHeader.tsx` → sin nav adaptada; oculta usuario en móvil
  pero no ofrece menú.
- `app/nueva-venta/page.tsx` (1076) y `app/expedientes/[id]/instrucciones/page.tsx` (813):
  formularios largos con padding fijo, sin sticky submit ni reflujo móvil.
- Targets táctiles: botones/badges con `py-0.5`, `text-[9px]`/`text-[10px]`, áreas <44px.

---

## Estrategia base

**Tres tamaños con experiencia propia:**
- **Teléfono** `< 640px` (`base`): una columna, nav y acciones colapsadas, listas como
  tarjetas, CTAs full-width y sticky, modales como hoja inferior.
- **Tablet** `640–1023px` (`sm`/`md`): 2 columnas donde aporte, filtros en grid, tablas
  con scroll-x controlado o tarjetas de 2 col, toolbars desplegándose.
- **Desktop** `≥ 1024px` (`lg`/`xl`): layout actual, intacto.

**Reglas transversales (aplican en todo):**
- Mobile-first estricto: clases base = teléfono; `sm:`/`md:`/`lg:` solo añaden.
- Padding consistente: `px-4 sm:px-6 lg:px-8`; contenedores `max-w-7xl mx-auto`.
- Targets táctiles ≥ 44px.
- Inputs `text-base` en móvil (evita zoom de iOS): `text-base sm:text-sm`.
- `min-h-dvh` en vez de `min-h-screen` donde haya barras sticky.
- `env(safe-area-inset-*)` / `viewport-fit=cover` en barras y hojas.
- Tokens, no literales: al tocar un archivo con hex/px inline, migrar a `var(--color-*)` /
  `var(--radius-*)` (cumple `DESIGN.md`).
- Motion existente: respetar `prefers-reduced-motion` (ya cubierto en CSS y `lib/motion.ts`).

---

## Plan por módulo

### Fase 1 — Fundaciones compartidas (desbloquean el resto)

- **`app/layout.tsx`:** confirmar `viewport` (`width=device-width, initial-scale=1`,
  `viewport-fit=cover`). Usar `min-h-dvh` donde haya sticky.
- **`components/ui/Modal.tsx`** (impacta 7 modales) — responsivo sin cambiar su API:
  - Teléfono: hoja inferior → `items-end sm:items-center`, `rounded-t-2xl sm:rounded-xl`,
    `w-full`, `max-h-[90dvh]`, header sticky interno, cuerpo con `overflow-y-auto`,
    `p-4 sm:p-6`, safe-area inferior.
  - Tablet/desktop: centrado con `maxWidth` actual.
  - Motion: slide-up en móvil / scale en desktop, usando tokens de `lib/motion.ts`.
- **`components/ui/Button.tsx` / `Input.tsx`:** altura táctil mínima; inputs
  `text-base sm:text-sm`; soporte `w-full`.

### Fase 2 — Dashboard

- **`components/dashboard/DashboardHeader.tsx`:** `px-4 sm:px-6`; en teléfono, menú
  colapsable (ícono → popover) con Cola de Huérfanos + nombre usuario + Salir. Badge de
  huérfanos conservado.
- **`app/dashboard/page.tsx`:** `main` a `px-4 sm:px-6 lg:px-8`; revisar `space-y` móvil.
- **`components/dashboard/ContadoresEstado.tsx`:** ya correcto; bajar título a
  `text-xl sm:text-2xl` si aprieta en `grid-cols-2`.
- **`components/dashboard/FiltrosBusqueda.tsx`:** pasar de `flex-col sm:flex-row` a **grid**:
  botón "Nueva venta" full-width en teléfono, búsqueda a ancho completo, selects en 2
  columnas en teléfono/tablet y en fila solo en desktop (`grid-cols-2 lg:flex`).
- **Tablas:** `TablaExpedientes` ya correcta (auditar jerarquía de la tarjeta móvil y
  targets). `TablaClientes`: mejorar el bloque `lg:hidden` (chips + conteo) para que respire
  en teléfono; sin rehacer.

### Fase 3 — Detalle de expediente (`app/expedientes/[id]/page.tsx`)

Por secciones, migrando hex→tokens al pasar:
- Padding global: `px-6` → `px-4 sm:px-6 lg:px-8` (header y main).
- Header sticky (toolbar): en teléfono "Dashboard" se reduce a ícono, el código baja de
  línea si hace falta, Historial + Badge con `flex-wrap`/`gap`.
- Ficha (Bloque A): bloque de acciones lateral (`min-w-[180px]`) pasa a fila full-width
  arriba/abajo en teléfono (`flex-col`, botones `w-full`).
- Cuerpo `lg:grid-cols-12` (7/5): ya colapsa a 1 col; fijar `order-*` lógico en móvil.
- Documentos: miniaturas en scroll horizontal — OK; preview abre el Modal ya responsivo.
- Modales del expediente (Editar, Validar/Rechazar, Subir doc, Reenviar, Cancelar, Asignar
  huérfano): heredan el Modal responsivo; formularios internos a 1 col en móvil.

### Fase 4 — Nueva venta + Instrucciones

- **`app/nueva-venta/page.tsx`:** `px-4 sm:px-8`; homogeneizar
  `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`; **CTA de envío sticky** al fondo en teléfono
  (safe-area); inputs `text-base`; agrupar campos en 1 col móvil / 2 col tablet.
- **`app/expedientes/[id]/instrucciones/page.tsx`:** padding + columna única móvil; scroll
  interno en bloques de preview de correo para que no desborden.

### Fase 5 — Huérfanos + Login + barrido final

- **`huerfanos/page.tsx` + `OrphanQueuePage.jsx` + `AssignOrphanModal.jsx`:** lista en
  tarjetas en teléfono; modal hereda el Modal responsivo.
- **`app/login/page.tsx` + `LoginForm`:** título `text-3xl sm:text-4xl`; inputs `text-base`.
- Barrido de consistencia (paddings, targets, tokens) en componentes restantes.

### Fase 6 — QA responsive

- Probar anchos: 360 / 390 (teléfono), 768 / 834 (tablet), 1024 / 1280 (desktop).
- Verificar: sin overflow horizontal, targets ≥ 44px, legibilidad, safe-area,
  `prefers-reduced-motion`.
- Evidencia por breakpoint (capturas) con el preview; sin validación manual del usuario.

---

## Orden de ejecución

| Fase | Alcance | Motivo |
|------|---------|--------|
| F1 | Modal, layout/viewport, Button/Input | Desbloquean ~7 modales y todas las páginas |
| F2 | Dashboard (header, filtros, contadores, tablas) | Pantalla de entrada, mayor tráfico |
| F3 | Detalle de expediente | El más complejo y el que más rompe |
| F4 | Nueva venta + Instrucciones | Flujos largos, sticky CTA |
| F5 | Huérfanos + Login + barrido | Cierre y consistencia |
| F6 | QA responsive multi-breakpoint | Verificación final con evidencia |

---

## Principios a no romper

- No cambiar el diseño visual base ni agregar elementos nuevos (`DESIGN.md`).
- No inventar curvas/duraciones de motion: consumir tokens.
- Mobile-first; `sm:`/`md:`/`lg:` solo añaden.
- Tokens en vez de hex/px inline al tocar cada archivo.
