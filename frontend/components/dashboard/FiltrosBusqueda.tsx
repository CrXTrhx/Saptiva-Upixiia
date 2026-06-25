"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Estado,
  ExpedienteQuery,
  DocumentoRequerido,
  RangoFecha,
} from "@/lib/types";
import { ESTADOS, DOCUMENTOS_REQUERIDOS } from "@/lib/types";
import { statusColorMap } from "@/lib/status";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

type FechaPreset = "hoy" | "7dias" | "30dias";

type Props = {
  query: ExpedienteQuery;
  onChange: (query: ExpedienteQuery) => void;
};

const FECHA_PRESETS: { value: FechaPreset | ""; label: string }[] = [
  { value: "", label: "Fecha" },
  { value: "hoy", label: "Hoy" },
  { value: "7dias", label: "Últimos 7 días" },
  { value: "30dias", label: "Últimos 30 días" },
];

export function FiltrosBusqueda({ query, onChange }: Props) {
  const [searchLocal, setSearchLocal] = useState(query.search ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange({ ...query, search: searchLocal || undefined });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchLocal]);

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
      <Link href="/nueva-venta">
        <Button className="whitespace-nowrap shrink-0">+ Nueva venta</Button>
      </Link>

      <div className="relative flex-1 min-w-0">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          placeholder="Buscar por cliente, RFC, código, teléfono o correo"
          aria-label="Buscar expedientes"
          value={searchLocal}
          onChange={(e) => setSearchLocal(e.target.value)}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-9 pr-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] transition-colors focus:outline-2 focus:outline-offset-0 focus:outline-[var(--color-accent)] hover:border-[var(--color-muted)]"
        />
      </div>

      <select
        aria-label="Filtrar por estado"
        value={query.estado ?? ""}
        onChange={(e) =>
          onChange({
            ...query,
            estado: (e.target.value as Estado) || undefined,
          })
        }
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] transition-colors focus:outline-2 focus:outline-offset-0 focus:outline-[var(--color-accent)] hover:border-[var(--color-muted)] cursor-pointer"
      >
        <option value="">Estado</option>
        {ESTADOS.map((e) => (
          <option key={e} value={e}>
            {statusColorMap[e].label}
          </option>
        ))}
      </select>

      <select
        aria-label="Filtrar por fecha"
        value={
          query.rangoFecha && "preset" in query.rangoFecha
            ? query.rangoFecha.preset
            : ""
        }
        onChange={(e) =>
          onChange({
            ...query,
            rangoFecha: e.target.value
              ? { preset: e.target.value as FechaPreset }
              : undefined,
          })
        }
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] transition-colors focus:outline-2 focus:outline-offset-0 focus:outline-[var(--color-accent)] hover:border-[var(--color-muted)] cursor-pointer"
      >
        {FECHA_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Filtrar por documento faltante"
        value={query.documentoFaltante ?? ""}
        onChange={(e) =>
          onChange({
            ...query,
            documentoFaltante:
              (e.target.value as DocumentoRequerido) || undefined,
          })
        }
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] transition-colors focus:outline-2 focus:outline-offset-0 focus:outline-[var(--color-accent)] hover:border-[var(--color-muted)] cursor-pointer"
      >
        <option value="">Documento</option>
        {DOCUMENTOS_REQUERIDOS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </div>
  );
}
