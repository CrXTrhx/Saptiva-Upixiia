"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, AlertTriangle, Ban, Info } from "lucide-react";
import type { Estado } from "@/lib/types";

// =============================================================================
// P10 — Modal Cancelar Expediente
// -----------------------------------------------------------------------------
// Integrado en P5. No llama APIs ni backend: valida el motivo (obligatorio,
// ≥10 caracteres) y lo devuelve a P5 vía onConfirm(motivo). P5 cambia el estado
// a "cancelado" y registra el evento en el historial. No borra docs/notas/historial.
// =============================================================================

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
const MIN_MOTIVO = 10;

const estadoGlobalConfig: Record<Estado, { label: string; dot: string; bg: string; text: string }> = {
  CAPTURING: { label: "Captura", dot: "#8C9AAD", bg: "#EBEEF2", text: "#4F5A6B" },
  RECEIVING: { label: "Recepcion", dot: "#B58A7A", bg: "#F1E8E3", text: "#6B4E40" },
  IN_VALIDATION: { label: "Validacion", dot: "#C9A85C", bg: "#F6EFDD", text: "#7A6435" },
  COMPLETE: { label: "Completo", dot: "#8FA585", bg: "#ECF0E8", text: "#536648" },
  INCOMPLETE_EXPIRED: { label: "Vencido", dot: "#F19B42", bg: "#FCEEDB", text: "#A86518" },
  CANCELLED: { label: "Cancelado", dot: "#989396", bg: "#EAE7E6", text: "#5C5957" },
  ARCHIVED: { label: "Archivado", dot: "#B5AFA9", bg: "#EFECE9", text: "#7A7470" },
};

type CancelarExpedienteModalProps = {
  expediente?: {
    codigo: string;
    clienteNombre: string;
    estado: Estado;
    fechaCreacion: string;
    capturista: string;
  } | null;
  onConfirm: (motivo: string) => void;
  onClose: () => void;
  loading?: boolean;
};

export default function CancelarExpedienteModal({
  expediente,
  onConfirm,
  onClose,
  loading = false,
}: CancelarExpedienteModalProps) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");

  const trimmedLen = motivo.trim().length;
  const motivoValido = trimmedLen >= MIN_MOTIVO;
  const ecfg = expediente ? estadoGlobalConfig[expediente.estado] : null;

  function handleConfirm() {
    if (loading) return;
    if (!motivoValido) {
      setError(`El motivo es obligatorio (mínimo ${MIN_MOTIVO} caracteres).`);
      return;
    }
    onConfirm(motivo.trim());
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: "rgba(48,47,45,0.4)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      >
        <motion.div
          className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white"
          style={{ border: "1px solid #E5DED6", boxShadow: "0 20px 60px rgba(48,47,45,0.18)" }}
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* HEADER */}
          <div className="flex items-start justify-between gap-4 px-6 py-4" style={{ borderBottom: "1px solid #F0EBE5" }}>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: "#F6E6DF" }}>
                <Ban size={15} style={{ color: "#9C4B2E" }} />
              </span>
              <div className="min-w-0">
                <h2 className="text-[16px] font-semibold" style={{ color: "#302F2D" }}>Cancelar expediente</h2>
                <p className="mt-0.5 text-[12px]" style={{ color: "#989396" }}>
                  Esta acción cambiará el estado del expediente a cancelado y quedará registrada en el historial.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors"
              style={{ color: "#989396" }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#FAF6F1"; e.currentTarget.style.color = "#302F2D"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#989396"; }}
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </div>

          {/* BODY */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {/* Resumen del expediente */}
            {expediente && (
              <div className="mb-4 rounded-xl p-3.5" style={{ backgroundColor: "#FAF6F1", border: "1px solid #F0EBE5" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[13px] font-medium tabular-nums" style={{ color: "#302F2D" }}>{expediente.codigo}</span>
                  {ecfg && (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: ecfg.bg, color: ecfg.text }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ecfg.dot }} />
                      {ecfg.label}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[13px] font-medium" style={{ color: "#302F2D" }}>{expediente.clienteNombre}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: "#989396" }}>
                  <span>
                    Creado el{" "}
                    {new Date(expediente.fechaCreacion).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                  <span style={{ color: "#D8CFC9" }}>·</span>
                  <span>Capturista: {expediente.capturista}</span>
                </div>
              </div>
            )}

            {/* Advertencia sutil */}
            <div className="mb-4 flex items-start gap-2 rounded-xl p-3" style={{ backgroundColor: "#FBF1EE", border: "1px solid #F0DDD5" }}>
              <Info size={14} strokeWidth={2} style={{ color: "#9C4B2E" }} className="mt-0.5 shrink-0" />
              <p className="text-[12px]" style={{ color: "#7A4A38" }}>
                Al cancelar este expediente, ya no aparecerá como expediente activo. El historial se conservará.
              </p>
            </div>

            {/* Motivo */}
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#5C5957" }}>
                Motivo de cancelación
              </label>
              <span className="text-[10px] tabular-nums" style={{ color: trimmedLen >= MIN_MOTIVO ? "#8FA585" : "#B5AFA9" }}>
                {trimmedLen}/{MIN_MOTIVO}
              </span>
            </div>
            <textarea
              value={motivo}
              onChange={(e) => { setMotivo(e.target.value); if (error) setError(""); }}
              placeholder="Ej. Cliente desistió de la compra"
              rows={3}
              className="w-full resize-none rounded-lg px-3.5 py-2.5 text-[13px] transition-colors"
              style={{ border: "1px solid #E5DED6", color: "#302F2D", backgroundColor: "#FFFFFF", outline: "none" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#F19B42")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#E5DED6")}
            />

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                  className="mt-2 flex items-center gap-1.5 text-[12px]"
                  style={{ color: "#9C4B2E" }}
                >
                  <AlertTriangle size={13} />
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* FOOTER */}
          <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4" style={{ borderTop: "1px solid #F0EBE5", backgroundColor: "#FAF6F1" }}>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-white px-4 py-2 text-[12px] font-medium transition-colors"
              style={{ border: "1px solid #E5DED6", color: "#5C5957" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#B5AFA9")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#E5DED6")}
            >
              Volver
            </button>
            <motion.button
              type="button"
              onClick={handleConfirm}
              disabled={!motivoValido || loading}
              whileHover={motivoValido && !loading ? { scale: 1.02 } : undefined}
              whileTap={motivoValido && !loading ? { scale: 0.98 } : undefined}
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[12px] font-medium text-white disabled:cursor-not-allowed"
              style={{ backgroundColor: motivoValido && !loading ? "#9C4B2E" : "#D8B6A8" }}
            >
              <Ban size={13} strokeWidth={2} />
              {loading ? "Cancelando…" : "Confirmar cancelación"}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
