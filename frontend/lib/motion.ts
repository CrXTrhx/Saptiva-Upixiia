// Tokens de motion compartidos para framer-motion.
// Espejo de los tokens CSS en app/globals.css y de la spec en DESIGN.md.
// Importa desde aquí en vez de redefinir curvas/duraciones por componente.

/** Curvas de easing (cubic-bezier como tupla para framer-motion). */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const; // entradas / reveal
export const EASE_IN = [0.4, 0, 1, 1] as const; // salidas
export const EASE_IN_OUT = [0.4, 0, 0.2, 1] as const; // cambios de estado

/** Duraciones estándar en segundos (framer-motion usa segundos). */
export const DUR = {
  micro: 0.15, // hover/focus/pressed, micro
  hover: 0.18, // elevaciones, surface
  entrance: 0.32, // aparición de contenido
  overlay: 0.22, // modals / overlays
} as const;

/** Aparición sutil de elementos en página (fade + slide-up leve). */
export const fadeRise = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: { duration: DUR.entrance, ease: EASE_OUT },
};

/** Fade simple para backdrops / overlays. */
export const overlayFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: DUR.overlay, ease: EASE_OUT },
};

/** Pop de modal/diálogo (fade + scale). */
export const modalPop = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
  transition: { duration: DUR.overlay, ease: EASE_OUT },
};
