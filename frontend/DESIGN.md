# DESIGN.md — Sistema visual y de motion de digitalfoldr

Guía para agentes y personas que construyen UI en este frontend. El objetivo es
que cualquier pantalla nueva se sienta **premium, suave y consistente** sin
reinventar valores. **No cambies el diseño visual base** — esta guía añade una
capa de motion conectada al sistema visual existente.

> Stack: Next.js 16 · React 19 · Tailwind v4 · framer-motion 12 · lucide-react.
> Tokens visuales (color, radius) viven en [`app/globals.css`](app/globals.css).

---

## Principios visuales (resumen)

- **Tokens, no literales.** Usa las variables CSS (`var(--color-accent)`,
  `var(--radius-lg)`, etc.). No hardcodees hex ni px sueltos.
- **Paleta cálida y sobria** sobre fondo crema (`--color-bg`), acento naranja
  (`--color-accent`). Superficies blancas con bordes suaves.
- **Jerarquía por peso y color de texto**, no por saturación.

---

## Motion & Microinteractions

Filosofía: el movimiento **comunica** (origen, jerarquía, feedback), no decora.
Microinteracciones reales > efectos vistosos. Si una animación no aclara algo,
no va.

### Motion principles

1. **Rápido y discreto.** El motion acompaña la acción, nunca la hace esperar.
2. **Físicamente coherente.** Lo que entra desde abajo, sale hacia abajo. Las
   curvas imitan desaceleración natural (`ease-out` para entradas).
3. **Una cosa a la vez.** Evita cascadas largas y múltiples elementos animando
   en paralelo. Prefiere un fade/scale corto del contenedor.
4. **Consistente.** Mismas duraciones y curvas en toda la app vía tokens.
5. **Accesible.** Todo respeta `prefers-reduced-motion` (ver abajo).

### Duraciones estándar (tokens)

CSS: `var(--dur-*)` en [`app/globals.css`](app/globals.css). JS: `DUR.*` en
[`lib/motion.ts`](lib/motion.ts) (en segundos para framer-motion).

| Token | Valor | Uso |
|-------|-------|-----|
| `--dur-micro` / `DUR.micro` | **150 ms** | hover, focus, pressed, cambios de color, micro |
| `--dur-hover` / `DUR.hover` | **180 ms** | elevaciones, cambios de superficie |
| `--dur-overlay` / `DUR.overlay` | **220 ms** | modals, overlays, popovers |
| `--dur-entrance` / `DUR.entrance` | **320 ms** | aparición/reveal de contenido |

Rangos de referencia: microinteractions 120–180 ms · hover/focus/pressed
150–200 ms · entrance/reveal 250–400 ms · modals/overlays 200–300 ms.

### Easing tokens

CSS: `var(--ease-*)`. JS: `EASE_OUT` / `EASE_IN` / `EASE_IN_OUT` en
[`lib/motion.ts`](lib/motion.ts).

| Token | Curva | Cuándo |
|-------|-------|--------|
| `--ease-out` / `EASE_OUT` | `cubic-bezier(0.16, 1, 0.3, 1)` | **entradas / reveal** (default) |
| `--ease-in` / `EASE_IN` | `cubic-bezier(0.4, 0, 1, 1)` | **salidas** (exit) |
| `--ease-in-out` / `EASE_IN_OUT` | `cubic-bezier(0.4, 0, 0.2, 1)` | **cambios de estado** |

Spring suave: permitido (el stack tiene framer-motion). Úsalo solo para
indicadores que se mueven entre posiciones (ej. el pill de tabs). Config
recomendada: `{ type: "spring", stiffness: 420, damping: 34 }`. Nada rebotón.

### Cómo consumir el motion

- **CSS / Tailwind** (preferido para hover/focus/pressed y transiciones de
  estado): `transition duration-150 ease-out`, o utilidades `.animate-rise` /
  `.animate-fade` / `.skeleton`.
- **framer-motion** (para enter/exit con desmontaje, listas, indicadores): importa
  variants y tokens de [`lib/motion.ts`](lib/motion.ts) (`fadeRise`,
  `overlayFade`, `modalPop`, `EASE_OUT`, `DUR`). No redefinas curvas por archivo.

---

## Component motion specs

| Componente | Spec | Dónde |
|------------|------|-------|
| **Buttons** | hover: cambio de superficie + `shadow-sm` (primary/secondary). pressed: `active:scale-[0.98]`. focus: ring visible. `transition duration-150 ease-out`. | [`components/ui/Button.tsx`](components/ui/Button.tsx) |
| **Cards** | estáticas: sin motion. interactivas (`interactive`): `hover:-translate-y-0.5 hover:shadow-md`, 180 ms. | [`components/ui/Card.tsx`](components/ui/Card.tsx) |
| **Inputs** | focus ring animado vía `box-shadow` (`--color-accent-ring`) con `transition-[color,border-color,box-shadow] 150ms`. | [`components/ui/Input.tsx`](components/ui/Input.tsx) |
| **Modals** | backdrop fade + card fade+scale(0.96→1), `DUR.overlay`, `EASE_OUT`, `AnimatePresence` para exit. | [`components/ui/Modal.tsx`](components/ui/Modal.tsx) |
| **Tabs / toggles** | indicador deslizante con `layoutId` (spring). El texto cambia de color en 150 ms. | [`components/dashboard/VistaToggle.tsx`](components/dashboard/VistaToggle.tsx) |
| **Accordions** | altura `auto`↔`0` con `ease-in-out`; usar `motion` con `height: auto` o `grid-rows` 1fr/0fr. ~220–280 ms. | (al añadir) |
| **Loading / skeleton** | utilidad `.skeleton` (shimmer) o `<Skeleton/>`. No usar spinners para contenido de página; spinner solo en botones (`loading`). | [`components/ui/Skeleton.tsx`](components/ui/Skeleton.tsx) |
| **Dashboard widgets** | aparición sutil con `fadeRise` o fade corto; hover de tarjetas-contador con `shadow-sm`. Sin cascadas largas. | [`components/dashboard/*`](components/dashboard) |
| **Empty states** | fade-in simple (`.animate-fade`). Sin movimiento llamativo. | — |
| **Nav / sidebar** | items: `transition-colors 150ms` + estado activo claro. Paneles que abren: slide+fade `EASE_OUT`, exit `EASE_IN`. | — |

---

## Do / Don't

**Do**
- Usa los tokens (`--dur-*`, `--ease-*`, `DUR`, `EASE_*`). 
- `ease-out` para entrar, `ease-in` para salir, `ease-in-out` para cambios.
- Anima `transform` y `opacity` (baratos). Press = `scale(0.97–0.99)`.
- Da feedback inmediato al input del usuario (hover/press en < 200 ms).
- Envuelve enter/exit con `AnimatePresence` cuando el elemento se desmonta.

**Don't**
- ❌ Animar `width`/`height`/`top`/`left` si puedes usar `transform`.
- ❌ Cascadas largas, bounces exagerados, o durations > 400 ms en UI.
- ❌ Curvas o duraciones inventadas por componente.
- ❌ Spinners para cargar páginas (usa skeletons).
- ❌ Animar sin contemplar `prefers-reduced-motion`.

---

## Accesibilidad — `prefers-reduced-motion` (obligatorio)

1. **CSS:** [`app/globals.css`](app/globals.css) tiene una regla global que reduce
   a ~0 toda animación/transición CSS cuando el usuario lo pide. Las utilidades
   `.skeleton`, `.animate-rise`, etc. quedan cubiertas automáticamente.
2. **framer-motion:** las animaciones JS **no** las frena el CSS. En cada
   componente con `motion`, usa `useReducedMotion()` y desactiva
   `scale`/`y`/spring (déjalo en fade o sin animación). Patrón:

   ```tsx
   const reduceMotion = useReducedMotion();
   <motion.div
     initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
     animate={{ opacity: 1, scale: 1 }}
     transition={{ duration: DUR.overlay, ease: EASE_OUT }}
   />
   ```

Toda PR que agregue motion debe verificarse con *reduce motion* activado
(DevTools → Rendering → Emulate CSS prefers-reduced-motion).
