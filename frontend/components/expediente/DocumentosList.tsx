"use client";

import {
  FileText,
  Upload,
  CheckCircle,
  XCircle,
  RefreshCw,
  Sparkles,
  History,
} from "lucide-react";
import type { Documento, EstadoDocumento } from "@/lib/types";
import { Button } from "@/components/ui/Button";

type DocumentosListProps = {
  documentos: Documento[];
  onValidar: (docId: string) => void;
  onRechazar: (doc: Documento) => void;
  onReemplazar: (doc: Documento) => void;
  onSubir: () => void;
  onPreview: (doc: Documento) => void;
  onVersionAnterior: (doc: Documento) => void;
};

const estadoBadgeStyle: Record<
  Exclude<EstadoDocumento, "pendiente" | "reemplazado">,
  { bg: string; text: string }
> = {
  recibido: { bg: "var(--color-slate-bg)", text: "var(--color-slate-text)" },
  validado: { bg: "var(--color-success-bg)", text: "var(--color-success)" },
  rechazado: { bg: "var(--color-coral-bg)", text: "var(--color-coral-text)" },
  vencido: { bg: "var(--color-amber-bg)", text: "var(--color-amber-text)" },
};

const canalLabels: Record<string, string> = {
  whatsapp: "WhatsApp",
  correo: "Correo",
  upload: "Carga manual",
};

function EstadoBadge({ estado }: { estado: EstadoDocumento }) {
  if (estado === "pendiente" || estado === "reemplazado") return null;
  const style = estadoBadgeStyle[estado];
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {estado}
    </span>
  );
}

function CanalChip({ canal }: { canal: string }) {
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        backgroundColor: "var(--color-bg)",
        color: "var(--color-text-secondary)",
      }}
    >
      {canalLabels[canal] ?? canal}
    </span>
  );
}

function isImageMime(mimeType: string) {
  return mimeType.startsWith("image/");
}

function DocCard({
  doc,
  onValidar,
  onRechazar,
  onReemplazar,
  onPreview,
  onVersionAnterior,
}: {
  doc: Documento;
  onValidar: (docId: string) => void;
  onRechazar: (doc: Documento) => void;
  onReemplazar: (doc: Documento) => void;
  onPreview: (doc: Documento) => void;
  onVersionAnterior: (doc: Documento) => void;
}) {
  const fechaRecepcion = new Date(doc.fechaRecepcion).toLocaleDateString(
    "es-MX",
    { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
  );

  return (
    <div
      className="flex gap-4 rounded-xl border p-4"
      style={{ borderColor: "var(--color-border-inner)" }}
    >
      {/* Preview thumbnail */}
      <button
        type="button"
        onClick={() => onPreview(doc)}
        className="shrink-0 w-20 h-20 rounded-lg overflow-hidden border flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-bg)",
        }}
      >
        {isImageMime(doc.mimeType) && doc.archivoUrl ? (
          <img
            src={doc.archivoUrl}
            alt={doc.filename}
            className="w-full h-full object-cover"
          />
        ) : (
          <FileText size={28} style={{ color: "var(--color-muted)" }} />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {/* Top: tipo + badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            {doc.tipo}
          </span>
          <EstadoBadge estado={doc.estado} />
          <CanalChip canal={doc.canal} />
        </div>

        {/* Filename */}
        <span
          className="text-xs font-mono truncate"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {doc.filename}
        </span>

        {/* Timestamp + remitente */}
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {fechaRecepcion} &middot; {doc.remitente}
        </span>

        {/* Datos extraidos */}
        {doc.datosExtraidos &&
          Object.keys(doc.datosExtraidos).length > 0 && (
            <div className="mt-1">
              <div className="flex items-center gap-1 mb-1">
                <Sparkles
                  size={12}
                  style={{ color: "var(--color-accent)" }}
                />
                <span
                  className="text-[10px] uppercase tracking-wider font-medium"
                  style={{ color: "var(--color-accent-text-dark)" }}
                >
                  Datos extraídos
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                {Object.entries(doc.datosExtraidos).map(([key, val]) => (
                  <span
                    key={key}
                    className="text-xs"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    <span className="font-medium">{key}:</span> {val}
                  </span>
                ))}
              </div>
            </div>
          )}

        {/* Version anterior */}
        {doc.versionAnterior && (
          <button
            type="button"
            onClick={() => onVersionAnterior(doc)}
            className="flex items-center gap-1 text-xs mt-0.5 cursor-pointer hover:underline"
            style={{ color: "var(--color-accent)" }}
          >
            <History size={12} />
            Ver versión anterior
          </button>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-1.5">
          {doc.estado !== "validado" && (
            <button
              type="button"
              onClick={() => onValidar(doc.id)}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer"
              style={{
                color: "var(--color-success)",
                backgroundColor: "var(--color-success-bg)",
              }}
            >
              <CheckCircle size={13} />
              Validar
            </button>
          )}
          <button
            type="button"
            onClick={() => onRechazar(doc)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer"
            style={{
              color: "var(--color-coral-text)",
              backgroundColor: "var(--color-coral-bg)",
            }}
          >
            <XCircle size={13} />
            Rechazar
          </button>
          <button
            type="button"
            onClick={() => onReemplazar(doc)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer"
            style={{
              color: "var(--color-text-secondary)",
              backgroundColor: "var(--color-bg)",
            }}
          >
            <RefreshCw size={13} />
            Reemplazar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DocumentosList({
  documentos,
  onValidar,
  onRechazar,
  onReemplazar,
  onSubir,
  onPreview,
  onVersionAnterior,
}: DocumentosListProps) {
  const visibleDocs = documentos.filter((d) => d.estado !== "reemplazado");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-tertiary)" }}
        >
          Documentos recibidos
        </h3>
        <Button variant="secondary" onClick={onSubir} className="!text-xs !px-3 !py-1.5">
          <Upload size={14} />
          Subir documento manual
        </Button>
      </div>

      {visibleDocs.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 py-10 rounded-xl border border-dashed"
          style={{ borderColor: "var(--color-border)" }}
        >
          <FileText size={32} style={{ color: "var(--color-muted)" }} />
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            No hay documentos recibidos
          </p>
          <Button variant="secondary" onClick={onSubir}>
            <Upload size={14} />
            Subir documento manual
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleDocs.map((doc) => (
            <DocCard
              key={doc.id}
              doc={doc}
              onValidar={onValidar}
              onRechazar={onRechazar}
              onReemplazar={onReemplazar}
              onPreview={onPreview}
              onVersionAnterior={onVersionAnterior}
            />
          ))}
        </div>
      )}
    </div>
  );
}
