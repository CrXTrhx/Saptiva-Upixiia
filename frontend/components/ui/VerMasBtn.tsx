"use client";

import { ChevronDown } from "lucide-react";

/**
 * Botón "Ver más" para la carga progresiva de listas largas. Muestra cuántas filas
 * se revelan y cuántas quedan. No carga datos: solo revela más filas ya en memoria.
 */
export function VerMasBtn({
  restantes,
  pageSize,
  onClick,
  className = "",
}: {
  restantes: number;
  pageSize: number;
  onClick: () => void;
  className?: string;
}) {
  const cuantas = Math.min(pageSize, restantes);
  return (
    <div
      className={`flex justify-center border-t border-[var(--color-border)] p-3 ${className}`}
    >
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        aria-label={`Ver ${cuantas} más; quedan ${restantes}`}
      >
        <ChevronDown size={14} aria-hidden="true" />
        Ver {cuantas} más
        <span className="text-[var(--color-muted)]">· {restantes} restantes</span>
      </button>
    </div>
  );
}
