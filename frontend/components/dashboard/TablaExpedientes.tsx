"use client";

import { useRouter } from "next/navigation";
import type { Expediente } from "@/lib/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { usePaginacionRender } from "@/lib/usePaginacionRender";
import { VerMasBtn } from "@/components/ui/VerMasBtn";

const GRID_COLS = "160px 1.4fr 130px 150px 1.5fr 160px";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="grid animate-pulse border-b border-[var(--color-border)] last:border-b-0"
          style={{ gridTemplateColumns: GRID_COLS }}
        >
          {Array.from({ length: 6 }).map((_, j) => (
            <div key={j} className="px-5 py-3.5">
              <div
                className="h-4 rounded bg-[var(--color-border)]"
                style={{ width: `${55 + j * 8}%` }}
              />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="px-5 py-20 text-center">
      <p className="text-[var(--color-muted)] text-sm">
        {filtered
          ? "No se encontraron expedientes con los filtros aplicados."
          : "No hay expedientes registrados aún."}
      </p>
    </div>
  );
}

export function TablaExpedientes({
  expedientes,
  loading,
  hasFilters,
}: {
  expedientes: Expediente[];
  loading: boolean;
  hasFilters: boolean;
}) {
  const router = useRouter();
  const { mostrados, hayMas, restantes, verMas, pageSize } =
    usePaginacionRender(expedientes, 15);

  function handleRowClick(id: string) {
    router.push(`/expedientes/${id}`);
  }

  function handleKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleRowClick(id);
    }
  }

  return (
    <section>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        {/* Desktop / tablet — grid table with horizontal scroll on small screens */}
        <div className="overflow-x-auto hidden sm:block" role="table" aria-label="Expedientes">
          {/* Header */}
          <div
            className="grid border-b border-[var(--color-border)] bg-[var(--color-bg)]/40 min-w-[860px]"
            style={{ gridTemplateColumns: GRID_COLS }}
            role="row"
          >
            {["Código", "Cliente", "Fecha", "Estado", "Next step", "Capturista"].map(
              (h) => (
                <div
                  key={h}
                  role="columnheader"
                  className="px-5 py-2.5 text-xs font-medium text-[var(--color-muted)] uppercase tracking-wider"
                >
                  {h}
                </div>
              ),
            )}
          </div>

          {/* Body */}
          {loading ? (
            <SkeletonRows />
          ) : expedientes.length === 0 ? (
            <EmptyState filtered={hasFilters} />
          ) : (
            mostrados.map((exp) => {
              const isVencido = exp.estado === "INCOMPLETE_EXPIRED";
              return (
                <div
                  key={exp.id}
                  role="row link"
                  tabIndex={0}
                  aria-label={`Ver expediente ${exp.codigo}`}
                  onClick={() => handleRowClick(exp.id)}
                  onKeyDown={(e) => handleKeyDown(e, exp.id)}
                  className={`
                    relative grid items-center border-b border-[var(--color-border)] last:border-b-0
                    cursor-pointer transition-colors hover:bg-[var(--color-bg)]
                    focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]
                    min-w-[860px]
                  `}
                  style={{ gridTemplateColumns: GRID_COLS }}
                >
                  {/* Thin red left bar for vencidos */}
                  {isVencido && (
                    <span
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-red-500"
                      aria-hidden="true"
                    />
                  )}

                  <div className="px-5 py-4.5 font-mono text-xs whitespace-nowrap text-[var(--color-text)] flex items-center gap-1.5">
                    {isVencido && (
                      <svg
                        className="shrink-0 text-red-400"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    )}
                    {exp.codigo}
                  </div>
                  <div className="px-5 py-4.5 text-sm font-medium text-[var(--color-text)] truncate">
                    {exp.clienteNombre}
                  </div>
                  <div className="px-5 py-4.5 text-sm text-[var(--color-muted)] whitespace-nowrap">
                    {formatDate(exp.fechaCreacion)}
                  </div>
                  <div className="px-5 py-4.5">
                    <StatusBadge estado={exp.estado} />
                  </div>
                  <div className="px-5 py-4.5 text-sm text-[var(--color-muted)] truncate">
                    {exp.nextStepPrioritario}
                  </div>
                  <div className="px-5 py-4.5 text-sm text-[var(--color-muted)] whitespace-nowrap">
                    {exp.capturista}
                  </div>
                </div>
              );
            })
          )}
          {!loading && hayMas && (
            <VerMasBtn restantes={restantes} pageSize={pageSize} onClick={verMas} />
          )}
        </div>

        {/* Mobile (<640px) — compact cards */}
        <div className="sm:hidden divide-y divide-[var(--color-border)]">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4 animate-pulse space-y-2">
                <div className="h-4 w-32 rounded bg-[var(--color-border)]" />
                <div className="h-3 w-48 rounded bg-[var(--color-border)]" />
                <div className="h-3 w-24 rounded bg-[var(--color-border)]" />
              </div>
            ))
          ) : expedientes.length === 0 ? (
            <EmptyState filtered={hasFilters} />
          ) : (
            mostrados.map((exp) => {
              const isVencido = exp.estado === "INCOMPLETE_EXPIRED";
              return (
                <div
                  key={exp.id}
                  tabIndex={0}
                  role="link"
                  aria-label={`Ver expediente ${exp.codigo}`}
                  onClick={() => handleRowClick(exp.id)}
                  onKeyDown={(e) => handleKeyDown(e, exp.id)}
                  className={`
                    relative p-4 cursor-pointer transition-colors hover:bg-[var(--color-bg)]
                    focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]
                  `}
                >
                  {isVencido && (
                    <span
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-red-500"
                      aria-hidden="true"
                    />
                  )}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-xs text-[var(--color-text)]">
                      {exp.codigo}
                    </span>
                    <StatusBadge estado={exp.estado} />
                  </div>
                  <p className="font-medium text-sm text-[var(--color-text)]">
                    {exp.clienteNombre}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-[var(--color-muted)]">
                    <span>{formatDate(exp.fechaCreacion)}</span>
                    <span>·</span>
                    <span className="truncate">{exp.nextStepPrioritario}</span>
                  </div>
                </div>
              );
            })
          )}
          {!loading && hayMas && (
            <VerMasBtn restantes={restantes} pageSize={pageSize} onClick={verMas} />
          )}
        </div>
      </div>
    </section>
  );
}
