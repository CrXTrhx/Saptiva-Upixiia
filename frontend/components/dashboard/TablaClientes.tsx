"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, AlertTriangle } from "lucide-react";
import type { ClienteAgrupado, Expediente } from "@/lib/types";
import { TIPO_OPERACION_LABEL } from "@/lib/types";
import { statusColorMap, STATUS_DISPLAY_ORDER } from "@/lib/status";
import { StatusBadge } from "@/components/ui/StatusBadge";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const SUB_GRID = "150px 110px 130px 120px 130px 1fr 140px";

// Fondos suaves para el avatar; se reparten de forma estable por cliente.
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function ConteoChips({
  conteo,
}: {
  conteo: ClienteAgrupado["conteoPorEstado"];
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
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-4 last:border-b-0 animate-pulse"
        >
          <div className="h-9 w-9 rounded-full bg-[var(--color-border)]" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 rounded bg-[var(--color-border)]" />
            <div className="h-3 w-56 rounded bg-[var(--color-border)]" />
          </div>
          <div className="hidden sm:block h-6 w-48 rounded-full bg-[var(--color-border)]" />
        </div>
      ))}
    </>
  );
}

function ExpedienteSubRow({
  exp,
  onOpen,
}: {
  exp: Expediente;
  onOpen: (id: string) => void;
}) {
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(exp.id);
    }
  }

  return (
    <>
      {/* Desktop / tablet */}
      <div
        role="link"
        tabIndex={0}
        aria-label={`Ver expediente ${exp.codigo}`}
        onClick={() => onOpen(exp.id)}
        onKeyDown={onKey}
        className="hidden sm:grid items-center min-w-[900px] cursor-pointer border-b border-[var(--color-border)] last:border-b-0 transition-colors hover:bg-[var(--color-surface)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]"
        style={{ gridTemplateColumns: SUB_GRID }}
      >
        <div className="px-4 py-3 font-mono text-xs whitespace-nowrap text-[var(--color-text)]">
          {exp.codigo}
        </div>
        <div className="px-4 py-3 text-sm text-[var(--color-muted)] whitespace-nowrap">
          {formatDate(exp.fechaCreacion)}
        </div>
        <div className="px-4 py-3 text-sm text-[var(--color-muted)] whitespace-nowrap">
          {TIPO_OPERACION_LABEL[exp.tipoOperacion]}
        </div>
        <div className="px-4 py-3 text-sm font-medium text-[var(--color-text)] whitespace-nowrap">
          {formatMoney(exp.montoEstimado)}
        </div>
        <div className="px-4 py-3">
          <StatusBadge estado={exp.estado} />
        </div>
        <div className="px-4 py-3 text-sm text-[var(--color-muted)] truncate">
          {exp.nextStepPrioritario}
        </div>
        <div className="px-4 py-3 text-sm text-[var(--color-muted)] whitespace-nowrap">
          {exp.capturista}
        </div>
      </div>

      {/* Mobile */}
      <div
        role="link"
        tabIndex={0}
        aria-label={`Ver expediente ${exp.codigo}`}
        onClick={() => onOpen(exp.id)}
        onKeyDown={onKey}
        className="sm:hidden cursor-pointer border-b border-[var(--color-border)] last:border-b-0 px-4 py-3 transition-colors hover:bg-[var(--color-surface)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-[var(--color-text)]">
            {exp.codigo}
          </span>
          <StatusBadge estado={exp.estado} />
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <span>{TIPO_OPERACION_LABEL[exp.tipoOperacion]}</span>
          <span>·</span>
          <span className="font-medium text-[var(--color-text)]">
            {formatMoney(exp.montoEstimado)}
          </span>
          <span>·</span>
          <span>{formatDate(exp.fechaCreacion)}</span>
        </div>
        <p className="mt-1 text-xs text-[var(--color-muted)] truncate">
          {exp.nextStepPrioritario} · {exp.capturista}
        </p>
      </div>
    </>
  );
}

function ClienteRow({
  cliente,
  expanded,
  onToggle,
  onOpenExpediente,
}: {
  cliente: ClienteAgrupado;
  expanded: boolean;
  onToggle: (id: string) => void;
  onOpenExpediente: (id: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const tone = avatarTone(cliente.id);

  return (
    <div className="border-b border-[var(--color-border)] last:border-b-0">
      {/* Fila de cliente */}
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => onToggle(cliente.id)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left cursor-pointer transition-colors hover:bg-[var(--color-bg)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]"
      >
        <motion.span
          aria-hidden="true"
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
          className="shrink-0 text-[var(--color-muted)]"
        >
          <ChevronRight size={18} />
        </motion.span>

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
                  backgroundColor: statusColorMap.incompleto_vencido.bg,
                  color: statusColorMap.incompleto_vencido.text,
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

      {/* Chips en pantallas pequeñas (debajo de la fila) */}
      <div className="px-4 pb-3 lg:hidden">
        <div className="flex items-center justify-between gap-2 pl-12">
          <ConteoChips conteo={cliente.conteoPorEstado} />
          <span className="whitespace-nowrap text-xs font-medium text-[var(--color-muted)]">
            {cliente.totalExpedientes}{" "}
            {cliente.totalExpedientes === 1 ? "exp." : "exps."}
          </span>
        </div>
      </div>

      {/* Expedientes del cliente */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={
              reduceMotion ? { duration: 0 } : { duration: 0.22, ease: EASE_OUT }
            }
            className="overflow-hidden"
          >
            <div className="ml-4 mb-2 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/40 sm:ml-12">
              {cliente.expedientes.map((exp) => (
                <ExpedienteSubRow
                  key={exp.id}
                  exp={exp}
                  onOpen={onOpenExpediente}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TablaClientes({
  clientes,
  loading,
  hasFilters,
  expanded,
  onToggle,
}: {
  clientes: ClienteAgrupado[];
  loading: boolean;
  hasFilters: boolean;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  function openExpediente(id: string) {
    router.push(`/expedientes/${id}`);
  }

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
        clientes.map((cliente, i) => (
          <motion.div
            key={cliente.id}
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.2, delay: Math.min(i * 0.025, 0.2), ease: EASE_OUT }
            }
          >
            <ClienteRow
              cliente={cliente}
              expanded={expanded.has(cliente.id)}
              onToggle={onToggle}
              onOpenExpediente={openExpediente}
            />
          </motion.div>
        ))
      )}
    </section>
  );
}
