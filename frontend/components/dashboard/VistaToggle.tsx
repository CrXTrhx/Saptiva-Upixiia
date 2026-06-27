"use client";

import { Users, ArrowDownWideNarrow } from "lucide-react";

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
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
              active
                ? "bg-[var(--color-text)] text-white"
                : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
