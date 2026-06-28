<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Sistema visual y de motion

Antes de construir o modificar UI, lee [`DESIGN.md`](DESIGN.md). Define los tokens
de color/radius, y la spec de **Motion & Microinteractions** (duraciones, easing,
specs por componente, reglas Do/Don't y `prefers-reduced-motion` obligatorio).

- Tokens CSS: [`app/globals.css`](app/globals.css)
- Tokens/variants de framer-motion: [`lib/motion.ts`](lib/motion.ts)

No reinventes curvas ni duraciones: consúmelas desde esos tokens.
