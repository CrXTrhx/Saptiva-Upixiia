"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Estado,
  ExpedienteQuery,
  DocumentoRequerido,
  RangoFecha,
} from "@/lib/types";
import {
  ESTADOS,
  DOCUMENTOS_REQUERIDOS,
  DOCUMENTO_REQUERIDO_LABELS,
} from "@/lib/types";
import { statusColorMap } from "@/lib/status";
import { Button } from "@/components/ui/Button";
import { X } from "lucide-react";
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

  const hasFilters = !!(
    searchLocal ||
    query.estado ||
    query.rangoFecha ||
    query.documentoFaltante
  );

  function limpiarFiltros() {
    setSearchLocal("");
    onChange({});
  }

  return (
    <div className="flex flex-col gap-2">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <Link href="/nueva-venta" className="w-full lg:w-auto">
        <Button className="w-full whitespace-nowrap lg:w-auto shrink-0">+ Nueva venta</Button>
      </Link>

      <div className="relative w-full lg:flex-1 lg:min-w-0">
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
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-9 pr-3 text-base sm:text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] transition-colors focus:outline-2 focus:outline-offset-0 focus:outline-[var(--color-accent)] hover:border-[var(--color-muted)]"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex lg:shrink-0">
      <select
        aria-label="Filtrar por estado"
        value={query.estado ?? ""}
        onChange={(e) =>
          onChange({
            ...query,
            estado: (e.target.value as Estado) || undefined,
          })
        }
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-base sm:text-sm text-[var(--color-text)] transition-colors focus:outline-2 focus:outline-offset-0 focus:outline-[var(--color-accent)] hover:border-[var(--color-muted)] cursor-pointer"
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
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-base sm:text-sm text-[var(--color-text)] transition-colors focus:outline-2 focus:outline-offset-0 focus:outline-[var(--color-accent)] hover:border-[var(--color-muted)] cursor-pointer"
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
        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-base sm:text-sm text-[var(--color-text)] transition-colors focus:outline-2 focus:outline-offset-0 focus:outline-[var(--color-accent)] hover:border-[var(--color-muted)] cursor-pointer"
      >
        <option value="">Documento</option>
        {DOCUMENTOS_REQUERIDOS.map((d) => (
          <option key={d} value={d}>
            {DOCUMENTO_REQUERIDO_LABELS[d]}
          </option>
        ))}
      </select>
      </div>
    </div>

      {/* Limpiar filtros — fila propia debajo de los filtros, alineada a la derecha
          (bajo los selects), con espacio siempre reservado (visibility) para que no
          mueva nada al aparecer/desaparecer */}
      <div className="flex justify-end" style={{ visibility: hasFilters ? "visible" : "hidden" }}>
        <button
          type="button"
          onClick={limpiarFiltros}
          tabIndex={hasFilters ? 0 : -1}
          className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium cursor-pointer transition-colors"
          style={{ backgroundColor: "#FEE2E2", border: "1px solid #EF4444", color: "#B91C1C" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#FECACA")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#FEE2E2")}
        >
          <X size={12} /> Limpiar filtros
        </button>
      </div>
    </div>
  );
}
