"use client";

import { useState } from "react";
import { CheckCircle, XCircle, RotateCcw } from "lucide-react";
import type { Documento, MotivoRechazo, MotivoRechazoCategoria } from "@/lib/types";
import { DOC_TIPO_LABELS, ESTADO_DOC_LABELS } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type ValidarRechazarModalProps = {
  documento: Documento;
  onValidar: () => void;
  onRechazar: (motivo: MotivoRechazo) => void;
  onRevertir: () => void;
  onClose: () => void;
  loading: boolean;
};

const categoriaOptions: { value: MotivoRechazoCategoria; label: string }[] = [
  { value: "ILLEGIBLE", label: "Ilegible" },
  { value: "TYPE_MISMATCH", label: "Tipo no coincide" },
  { value: "EXPIRED", label: "Vencido" },
  { value: "OTHER", label: "Otro" },
];

export default function ValidarRechazarModal({
  documento,
  onValidar,
  onRechazar,
  onRevertir,
  onClose,
  loading,
}: ValidarRechazarModalProps) {
  const [categoria, setCategoria] = useState<MotivoRechazoCategoria>("ILLEGIBLE");
  const [texto, setTexto] = useState("");

  const isRechazadoAuto =
    documento.estado === "REJECTED" && documento.rechazoAutomatico;

  function handleRechazar() {
    if (!texto.trim()) return;
    onRechazar({ categoria, texto: texto.trim() });
  }

  return (
    <Modal open onClose={onClose} title="Revisar documento">
      {/* Doc info */}
      <div
        className="rounded-lg p-3 mb-4"
        style={{ backgroundColor: "var(--color-bg)" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            {DOC_TIPO_LABELS[documento.tipo] ?? documento.tipo}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
            style={{
              backgroundColor:
                documento.estado === "REJECTED"
                  ? "var(--color-coral-bg)"
                  : documento.estado === "VALIDATED"
                    ? "var(--color-success-bg)"
                    : "var(--color-slate-bg)",
              color:
                documento.estado === "REJECTED"
                  ? "var(--color-coral-text)"
                  : documento.estado === "VALIDATED"
                    ? "var(--color-success)"
                    : "var(--color-slate-text)",
            }}
          >
            {ESTADO_DOC_LABELS[documento.estado] ?? documento.estado}
          </span>
        </div>
        <span
          className="text-xs font-mono"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {documento.filename}
        </span>
      </div>

      {isRechazadoAuto ? (
        /* Revert automatic rejection */
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Este documento fue rechazado automáticamente. Puedes revertir el
            rechazo para revisarlo manualmente.
          </p>
          <Button
            variant="secondary"
            onClick={onRevertir}
            loading={loading}
          >
            <RotateCcw size={15} />
            Revertir rechazo automático
          </Button>
        </div>
      ) : (
        /* Validar + Rechazar actions */
        <div className="flex flex-col gap-4">
          {/* Validar */}
          <Button
            variant="primary"
            onClick={onValidar}
            loading={loading}
            className="w-full"
            style={{
              backgroundColor: "var(--color-success)",
            }}
          >
            <CheckCircle size={15} />
            Validar documento
          </Button>

          {/* Separator */}
          <div
            className="border-t"
            style={{ borderColor: "var(--color-border-inner)" }}
          />

          {/* Rechazar section */}
          <div className="flex flex-col gap-3">
            <h4
              className="text-sm font-medium"
              style={{ color: "var(--color-text)" }}
            >
              Rechazar documento
            </h4>

            {/* Category select */}
            <div className="flex flex-col gap-1.5">
              <label
                className="text-xs font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Motivo
              </label>
              <select
                value={categoria}
                onChange={(e) =>
                  setCategoria(e.target.value as MotivoRechazoCategoria)
                }
                className="w-full rounded-lg border px-3 py-2 text-sm cursor-pointer"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                  backgroundColor: "var(--color-surface)",
                }}
              >
                {categoriaOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Texto */}
            <div className="flex flex-col gap-1.5">
              <label
                className="text-xs font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Descripción del rechazo
              </label>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Describe el motivo del rechazo..."
                rows={3}
                className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-2 focus:outline-offset-0 focus:outline-[var(--color-accent)]"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                  backgroundColor: "var(--color-surface)",
                }}
              />
            </div>

            <Button
              variant="secondary"
              onClick={handleRechazar}
              disabled={!texto.trim()}
              loading={loading}
              className="!text-[var(--color-coral-text)] !border-[var(--color-coral)] hover:!bg-[var(--color-coral-bg)]"
            >
              <XCircle size={15} />
              Confirmar rechazo
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
