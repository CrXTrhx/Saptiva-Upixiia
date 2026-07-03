"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Estado,
  ExpedienteQuery,
  DocumentoRequerido,
} from "@/lib/types";
import {
  DOCUMENTOS_REQUERIDOS,
  DOCUMENTO_REQUERIDO_LABELS,
} from "@/lib/types";
import { STATUS_DISPLAY_ORDER, statusColorMap } from "@/lib/status";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { X } from "lucide-react";
import Link from "next/link";

type FechaPreset = "hoy" | "7dias" | "30dias";

type Props = {
  query: ExpedienteQuery;
  onChange: (query: ExpedienteQuery) => void;
};

// Clases compartidas del trigger de los 3 filtros (las mismas que llevaba el
// <select> nativo; el panel de opciones lo estiliza el componente Select).
const FILTRO_TRIGGER_CLASS =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-base sm:text-sm text-[var(--color-text)] transition-colors focus:outline-2 focus:outline-offset-0 focus:outline-[var(--color-accent)] hover:border-[var(--color-muted)]";

// La opción "" limpia el filtro (equivale al "Estado"/"Fecha"/"Documento" del
// select nativo, pero con un label explícito dentro del panel).
const OPCIONES_FECHA: { value: FechaPreset | ""; label: string }[] = [
  { value: "", label: "Cualquier fecha" },
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
      <Select
        ariaLabel="Filtrar por estado"
        placeholder="Estado"
        value={query.estado ?? ""}
        onChange={(v) =>
          onChange({
            ...query,
            estado: (v as Estado) || undefined,
          })
        }
        options={[
          { value: "", label: "Todos los estados" },
          ...STATUS_DISPLAY_ORDER.map((e) => ({
            value: e,
            label: statusColorMap[e].label,
            dot: statusColorMap[e].dot,
          })),
        ]}
        className={FILTRO_TRIGGER_CLASS}
      />

      <Select
        ariaLabel="Filtrar por fecha"
        placeholder="Fecha"
        value={
          query.rangoFecha && "preset" in query.rangoFecha
            ? query.rangoFecha.preset
            : ""
        }
        onChange={(v) =>
          onChange({
            ...query,
            rangoFecha: v ? { preset: v as FechaPreset } : undefined,
          })
        }
        options={OPCIONES_FECHA}
        className={FILTRO_TRIGGER_CLASS}
      />

      <Select
        ariaLabel="Filtrar por documento faltante"
        placeholder="Documento"
        value={query.documentoFaltante ?? ""}
        onChange={(v) =>
          onChange({
            ...query,
            documentoFaltante: (v as DocumentoRequerido) || undefined,
          })
        }
        options={[
          { value: "", label: "Todos los documentos" },
          ...DOCUMENTOS_REQUERIDOS.map((d) => ({
            value: d,
            label: DOCUMENTO_REQUERIDO_LABELS[d],
          })),
        ]}
        className={FILTRO_TRIGGER_CLASS}
      />
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
