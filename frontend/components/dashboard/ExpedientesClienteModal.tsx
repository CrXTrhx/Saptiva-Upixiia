"use client";

import { useRouter } from "next/navigation";
import { X, AlertTriangle } from "lucide-react";
import type { ClienteAgrupado, Expediente } from "@/lib/types";
import { TIPO_OPERACION_LABEL } from "@/lib/types";
import { statusColorMap, STATUS_DISPLAY_ORDER } from "@/lib/status";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useEffect } from "react";

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

function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

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

function ExpedienteRow({ exp, onOpen }: { exp: Expediente; onOpen: (id: string) => void }) {
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(exp.id);
    }
  }

  return (
    <>
      {/* Desktop */}
      <div
        role="link"
        tabIndex={0}
        aria-label={`Ver expediente ${exp.codigo}`}
        onClick={() => onOpen(exp.id)}
        onKeyDown={onKey}
        className="hidden sm:grid items-center cursor-pointer border-b border-[var(--color-border)] last:border-b-0 transition-colors hover:bg-[var(--color-bg)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]"
        style={{ gridTemplateColumns: "130px 100px 120px 110px 120px 1fr" }}
      >
        <div className="px-3 py-3 font-mono text-xs whitespace-nowrap text-[var(--color-text)]">
          {exp.codigo}
        </div>
        <div className="px-3 py-3 text-xs text-[var(--color-muted)] whitespace-nowrap">
          {formatDate(exp.fechaCreacion)}
        </div>
        <div className="px-3 py-3 text-xs text-[var(--color-muted)] whitespace-nowrap">
          {TIPO_OPERACION_LABEL[exp.tipoOperacion]}
        </div>
        <div className="px-3 py-3 text-xs font-medium text-[var(--color-text)] whitespace-nowrap">
          {formatMoney(exp.montoEstimado)}
        </div>
        <div className="px-3 py-3">
          <StatusBadge estado={exp.estado} />
        </div>
        <div className="px-3 py-3 text-xs text-[var(--color-muted)] truncate">
          {exp.nextStepPrioritario}
        </div>
      </div>

      {/* Mobile */}
      <div
        role="link"
        tabIndex={0}
        aria-label={`Ver expediente ${exp.codigo}`}
        onClick={() => onOpen(exp.id)}
        onKeyDown={onKey}
        className="sm:hidden cursor-pointer border-b border-[var(--color-border)] last:border-b-0 px-4 py-3 transition-colors hover:bg-[var(--color-bg)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]"
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
          {exp.nextStepPrioritario}
        </p>
      </div>
    </>
  );
}

export function ExpedientesClienteModal({
  cliente,
  onClose,
}: {
  cliente: ClienteAgrupado | null;
  onClose: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!cliente) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [cliente, onClose]);

  useEffect(() => {
    if (!cliente) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [cliente]);

  if (!cliente) return null;

  const tone = avatarTone(cliente.id);

  function openExpediente(id: string) {
    router.push(`/expedientes/${id}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-[fadeIn_150ms_ease-out]">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(48, 47, 45, 0.4)" }}
        onClick={onClose}
      />

      {/* Card */}
      <div
        className="relative w-full max-w-3xl mx-4 rounded-xl border bg-[var(--color-surface)] shadow-lg overflow-hidden flex flex-col animate-[scaleIn_200ms_cubic-bezier(0.16,1,0.3,1)]"
        style={{ borderColor: "var(--color-border)", maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-4 shrink-0">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold"
            style={{ backgroundColor: tone.bg, color: tone.text }}
            aria-hidden="true"
          >
            {iniciales(cliente.nombre)}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-[var(--color-text)]">
                {cliente.nombre}
              </h2>
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
              <span>{cliente.telefono}</span>
              <span aria-hidden="true">·</span>
              <span>{cliente.correo}</span>
              {cliente.rfc && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{cliente.rfc}</span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer shrink-0"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Summary bar */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-inner)] bg-[var(--color-bg)]/50 px-5 py-2.5 shrink-0">
          <ConteoChips conteo={cliente.conteoPorEstado} />
          <div className="flex items-center gap-3 text-xs text-[var(--color-muted)] shrink-0">
            <span className="font-medium text-[var(--color-text)]">
              {formatMoney(cliente.montoTotal)}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {cliente.totalExpedientes}{" "}
              {cliente.totalExpedientes === 1 ? "expediente" : "expedientes"}
            </span>
          </div>
        </div>

        {/* Table header (desktop) */}
        <div
          className="hidden sm:grid items-center border-b border-[var(--color-border-inner)] bg-[var(--color-bg)]/30 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)] shrink-0"
          style={{ gridTemplateColumns: "130px 100px 120px 110px 120px 1fr" }}
        >
          <div className="px-3 py-2">Código</div>
          <div className="px-3 py-2">Fecha</div>
          <div className="px-3 py-2">Operación</div>
          <div className="px-3 py-2">Monto</div>
          <div className="px-3 py-2">Estado</div>
          <div className="px-3 py-2">Siguiente paso</div>
        </div>

        {/* Expedientes list */}
        <div className="overflow-y-auto flex-1">
          {cliente.expedientes.map((exp) => (
            <ExpedienteRow key={exp.id} exp={exp} onOpen={openExpediente} />
          ))}
        </div>
      </div>
    </div>
  );
}
