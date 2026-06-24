"use client";

import type { Evento, TonoEvento } from "@/lib/types";

type HistorialEventosProps = {
  eventos: Evento[];
};

const dotColorMap: Record<TonoEvento, string> = {
  ok: "var(--color-success)",
  warn: "var(--color-amber)",
  accent: "var(--color-accent)",
  neutral: "var(--color-muted)",
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month} ${hours}:${mins}`;
}

export default function HistorialEventos({ eventos }: HistorialEventosProps) {
  return (
    <div className="flex flex-col gap-1">
      <h3
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--color-tertiary)" }}
      >
        Historial
      </h3>

      {eventos.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Sin eventos aún
        </p>
      ) : (
        <div className="flex flex-col">
          {eventos.map((ev, idx) => (
            <div key={ev.id} className="flex gap-3">
              {/* Timeline column */}
              <div className="flex flex-col items-center">
                <span
                  className="mt-1.5 h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: dotColorMap[ev.tono] }}
                />
                {idx < eventos.length - 1 && (
                  <div
                    className="w-px flex-1 my-1"
                    style={{ backgroundColor: "var(--color-border)" }}
                  />
                )}
              </div>

              {/* Content */}
              <div className="pb-4 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-xs font-medium"
                    style={{ color: "var(--color-text)" }}
                  >
                    {ev.tipo}
                  </span>
                  <span
                    className="text-[11px] font-mono tabular-nums"
                    style={{ color: "var(--color-muted)" }}
                  >
                    {formatTimestamp(ev.timestamp)}
                  </span>
                </div>
                <p
                  className="text-sm mt-0.5"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {ev.descripcion}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
