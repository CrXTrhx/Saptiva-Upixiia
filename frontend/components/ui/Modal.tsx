"use client";

import { type ReactNode, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { DUR, EASE_OUT } from "@/lib/motion";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
  /** Clase de z-index del overlay. Sube esto cuando el modal puede abrirse por
   * encima de otro modal ya abierto (p. ej. una previsualización lanzada desde
   * dentro de otro modal), para que quede siempre arriba sin depender del orden
   * de montaje en el DOM. */
  zIndexClass?: string;
};

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
  zIndexClass = "z-50",
}: ModalProps) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 ${zIndexClass} flex items-end justify-center sm:items-center`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DUR.overlay, ease: EASE_OUT }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(48, 47, 45, 0.4)" }}
            onClick={onClose}
          />

          {/* Card — en móvil: hoja inferior a ancho completo con scroll interno.
              En tablet/desktop (sm+): tarjeta centrada como antes. */}
          <motion.div
            className={`relative flex w-full flex-col overflow-hidden rounded-t-2xl border bg-[var(--color-surface)] shadow-lg max-h-[90dvh] ${maxWidth} sm:mx-4 sm:max-h-[85vh] sm:rounded-xl`}
            style={{ borderColor: "var(--color-border)" }}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 24, scale: 1 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 24, scale: 1 }
            }
            transition={{ duration: DUR.overlay, ease: EASE_OUT }}
          >
            {/* Header — sticky para que el cierre quede siempre accesible aunque el
                cuerpo tenga scroll (hojas largas en móvil). */}
            <div
              className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b bg-[var(--color-surface)] px-4 pt-3 pb-3 sm:border-b-0 sm:px-6 sm:pt-6 sm:pb-4"
              style={{ borderColor: "var(--color-border-inner)" }}
            >
              {/* Grabber visual de hoja inferior — solo móvil */}
              <span
                className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full sm:hidden"
                style={{ backgroundColor: "var(--color-border)" }}
                aria-hidden="true"
              />
              <h2 className="text-lg font-semibold text-[var(--color-text)] pt-2 sm:pt-0">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer sm:h-9 sm:w-9"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
