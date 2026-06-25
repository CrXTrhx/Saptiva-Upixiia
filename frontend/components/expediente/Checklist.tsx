"use client";

import { Clock, FileText, Check, X, AlertTriangle } from "lucide-react";
import type { ChecklistItem, DocumentoRequerido, EstadoDocumento } from "@/lib/types";
import { DOC_TIPO_LABELS } from "@/lib/types";

type ChecklistProps = {
  checklist: ChecklistItem[];
  onSelectTipo: (tipo: DocumentoRequerido) => void;
  onToast: (msg: string) => void;
};

const iconByEstado: Record<
  EstadoDocumento,
  { Icon: typeof Clock; color: string }
> = {
  PENDING: { Icon: Clock, color: "var(--color-muted)" },
  RECEIVED: { Icon: FileText, color: "var(--color-slate-dot)" },
  VALIDATED: { Icon: Check, color: "var(--color-success)" },
  REJECTED: { Icon: X, color: "var(--color-coral)" },
  EXPIRED: { Icon: AlertTriangle, color: "var(--color-amber)" },
  REPLACED: { Icon: FileText, color: "var(--color-muted)" },
};

const labelByEstado: Record<EstadoDocumento, string> = {
  PENDING: "Pendiente",
  RECEIVED: "Recibido",
  VALIDATED: "Validado",
  REJECTED: "Rechazado",
  EXPIRED: "Vencido",
  REPLACED: "Reemplazado",
};

export default function Checklist({
  checklist,
  onSelectTipo,
  onToast,
}: ChecklistProps) {
  function handleClick(item: ChecklistItem) {
    if (item.documentoId) {
      onSelectTipo(item.tipo);
    } else {
      onToast(`Aún no se recibe el documento ${DOC_TIPO_LABELS[item.tipo] ?? item.tipo}`);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <h3
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--color-tertiary)" }}
      >
        Checklist de documentos
      </h3>
      {checklist.map((item) => {
        const { Icon, color } = iconByEstado[item.estado];
        const isMuted = item.estado === "PENDING";

        return (
          <button
            key={item.tipo}
            type="button"
            onClick={() => handleClick(item)}
            className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-bg-hover)] cursor-pointer"
          >
            <Icon size={16} style={{ color, flexShrink: 0 }} />
            <span
              className="text-sm font-medium flex-1"
              style={{
                color: isMuted ? "var(--color-muted)" : "var(--color-text)",
              }}
            >
              {DOC_TIPO_LABELS[item.tipo] ?? item.tipo}
            </span>
            <span
              className="text-[11px] font-medium"
              style={{ color }}
            >
              {labelByEstado[item.estado]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
