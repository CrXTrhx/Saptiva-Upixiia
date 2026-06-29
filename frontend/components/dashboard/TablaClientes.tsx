"use client";

import { memo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import type { ClienteResumen } from "@/lib/types";
import { statusColorMap, STATUS_DISPLAY_ORDER } from "@/lib/status";
import { usePaginacionRender } from "@/lib/usePaginacionRender";
import { VerMasBtn } from "@/components/ui/VerMasBtn";
import { EASE_OUT, DUR } from "@/lib/motion";

const AVATAR_TONES: { bg: string; text: string }[] = [
  { bg: "#ECF0E8", text: "#536648" },
  { bg: "#EBEEF2", text: "#4F5A6B" },
  { bg: "#F1E8E3", text: "#6B4E40" },
  { bg: "#F6EFDD", text: "#7A6435" },
  { bg: "#F6E6DF", text: "#9C4B2E" },
];

function avatarTone(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);
}

const ConteoChips = memo(function ConteoChips({
  conteo,
}: {
  conteo: ClienteResumen["conteoPorEstado"];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {STATUS_DISPLAY_ORDER.filter((e) => conteo[e]).map((estado) => {
        const c = statusColorMap[estado];
        return (
          <span
            key={estado}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
            style={{ backgroundColor: c.bg, color: c.text }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full shrink-0"
              style={{ backgroundColor: c.dot }}
              aria-hidden="true"
            />
            {conteo[estado]} {c.label}
          </span>
        );
      })}
    </div>
  );
});

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-4 last:border-b-0"
        >
          <div className="skeleton h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-40" />
            <div className="skeleton h-3 w-56" />
          </div>
          <div className="skeleton hidden sm:block h-6 w-48 rounded-full" />
        </div>
      ))}
    </>
  );
}

const ClienteRow = memo(function ClienteRow({
  cliente,
  onSelect,
}: {
  cliente: ClienteResumen;
  onSelect: (cliente: ClienteResumen) => void;
}) {
  const tone = avatarTone(cliente.id);

  return (
    <div className="border-b border-[var(--color-border)] last:border-b-0">
      <button
        type="button"
        onClick={() => onSelect(cliente)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left cursor-pointer transition-colors hover:bg-[var(--color-bg)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]"
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold"
          style={{ backgroundColor: tone.bg, color: tone.text }}
          aria-hidden="true"
        >
          {iniciales(cliente.nombre)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-[var(--color-text)]">
              {cliente.nombre}
            </span>
            {cliente.tieneUrgente && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{
                  backgroundColor: statusColorMap.INCOMPLETE_EXPIRED.bg,
                  color: statusColorMap.INCOMPLETE_EXPIRED.text,
                }}
              >
                <AlertTriangle size={10} aria-hidden="true" />
                Urgente
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--color-muted)]">
            <span className="whitespace-nowrap">{cliente.telefono}</span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap font-medium text-[var(--color-text)]">
              {formatMoney(cliente.montoTotal)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="hidden truncate sm:inline">{cliente.correo}</span>
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          <ConteoChips conteo={cliente.conteoPorEstado} />
          <span className="whitespace-nowrap text-xs font-medium text-[var(--color-muted)]">
            {cliente.totalExpedientes}{" "}
            {cliente.totalExpedientes === 1 ? "expediente" : "expedientes"}
          </span>
        </div>
      </button>

      {/* Chips en pantallas pequeñas */}
      <div className="px-4 pb-3 lg:hidden">
        <div className="flex items-center justify-between gap-2 pl-12">
          <ConteoChips conteo={cliente.conteoPorEstado} />
          <span className="whitespace-nowrap text-xs font-medium text-[var(--color-muted)]">
            {cliente.totalExpedientes}{" "}
            {cliente.totalExpedientes === 1 ? "exp." : "exps."}
          </span>
        </div>
      </div>
    </div>
  );
});

export function TablaClientes({
  clientes,
  loading,
  hasFilters,
  onSelectCliente,
}: {
  clientes: ClienteResumen[];
  loading: boolean;
  hasFilters: boolean;
  onSelectCliente: (cliente: ClienteResumen) => void;
}) {
  const reduceMotion = useReducedMotion();
  const { mostrados, hayMas, restantes, verMas, pageSize } =
    usePaginacionRender(clientes, 15);

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {loading ? (
        <SkeletonRows />
      ) : clientes.length === 0 ? (
        <div className="px-5 py-20 text-center">
          <p className="text-sm text-[var(--color-muted)]">
            {hasFilters
              ? "No se encontraron clientes con los filtros aplicados."
              : "No hay clientes registrados aún."}
          </p>
        </div>
      ) : (
        <>
          {/* Fade rápido y sin cascada: el contenido aparece de golpe. */}
          {mostrados.map((cliente) => (
            <motion.div
              key={cliente.id}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduceMotion ? 0 : DUR.micro, ease: EASE_OUT }}
            >
              <ClienteRow cliente={cliente} onSelect={onSelectCliente} />
            </motion.div>
          ))}
          {hayMas && (
            <VerMasBtn restantes={restantes} pageSize={pageSize} onClick={verMas} />
          )}
        </>
      )}
    </section>
  );
}
