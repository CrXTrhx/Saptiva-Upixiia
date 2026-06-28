"use client";

import { Users, ArrowDownWideNarrow } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { EASE_OUT } from "@/lib/motion";

export type VistaDashboard = "cliente" | "prioridad";

const OPCIONES: {
  value: VistaDashboard;
  label: string;
  icon: typeof Users;
}[] = [
  { value: "cliente", label: "Por cliente", icon: Users },
  { value: "prioridad", label: "Por prioridad", icon: ArrowDownWideNarrow },
];

export function VistaToggle({
  value,
  onChange,
}: {
  value: VistaDashboard;
  onChange: (v: VistaDashboard) => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      role="tablist"
      aria-label="Modo de vista del dashboard"
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1"
    >
      {OPCIONES.map(({ value: v, label, icon: Icon }) => {
        const active = v === value;
        return (
          <button
            key={v}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={`relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
              active ? "text-white" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {/* Indicador deslizante: se anima entre tabs con layoutId. */}
            {active && (
              <motion.span
                layoutId="vista-toggle-pill"
                className="absolute inset-0 rounded-md bg-[var(--color-text)]"
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 420, damping: 34 }
                }
                style={{ zIndex: 0 }}
                aria-hidden="true"
              />
            )}
            <Icon size={15} aria-hidden="true" className="relative z-10" />
            <span className="relative z-10">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
