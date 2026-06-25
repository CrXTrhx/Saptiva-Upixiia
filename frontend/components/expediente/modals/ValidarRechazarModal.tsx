"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Eye,
  Info,
} from "lucide-react";
import type {
  Documento,
  MotivoRechazo,
  MotivoRechazoCategoria,
} from "@/lib/types";

// =============================================================================
// P8 — Modal Validar / Rechazar Documento
// -----------------------------------------------------------------------------
// Integrado en P5. No llama APIs ni backend: recibe el documento por props y
// comunica las decisiones por callbacks. P5 actualiza estado/checklist/next
// steps/historial en sus handlers (handleValidarDoc / handleRechazarDoc /
// handleRevertirAuto). Solo consume documento.datosExtraidos (no hay OCR aquí).
// =============================================================================

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

const docEstadoConfig: Record<
  string,
  { label: string; dot: string; bg: string; text: string }
> = {
  pendiente: { label: "Pendiente", dot: "#989396", bg: "#EAE7E6", text: "#5C5957" },
  recibido: { label: "Recibido", dot: "#8C9AAD", bg: "#EBEEF2", text: "#4F5A6B" },
  validado: { label: "Validado", dot: "#8FA585", bg: "#ECF0E8", text: "#536648" },
  rechazado: { label: "Rechazado", dot: "#D88A6A", bg: "#F6E6DF", text: "#9C4B2E" },
  vencido: { label: "Vencido", dot: "#C9A85C", bg: "#F6EFDD", text: "#7A6435" },
  reemplazado: { label: "Reemplazado", dot: "#B5AFA9", bg: "#EFECE9", text: "#7A7470" },
};

const motivoOptions: { value: MotivoRechazoCategoria; label: string }[] = [
  { value: "ilegible", label: "Ilegible" },
  { value: "tipo_no_coincide", label: "Tipo de documento no coincide" },
  { value: "vencido", label: "Documento vencido" },
  { value: "datos_no_coinciden", label: "Datos no coinciden con el cliente" },
  { value: "incompleto", label: "Documento incompleto" },
  { value: "otro", label: "Otro" },
];

// Clave reservada dentro de datosExtraidos: no es un campo editable, es metadato.
const CONFIANZA_KEY = "confianza";

type ValidarRechazarModalProps = {
  documento: Documento;
  /** Contexto opcional del expediente (solo lectura, para el header). */
  expediente?: { codigo: string; clienteNombre: string } | null;
  /** "validate" o "reject" según el botón que abrió el modal. */
  mode?: "validate" | "reject";
  /** Datos extraídos editables por default. */
  extractedDataEditable?: boolean;
  onValidar: (datosExtraidos?: Record<string, string>) => void;
  onRechazar: (motivo: MotivoRechazo, datosExtraidos?: Record<string, string>) => void;
  onRevertir: () => void;
  onClose: () => void;
  loading?: boolean;
};

function formatRecepcion(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PreviewVisual({ doc, large }: { doc: Documento; large?: boolean }) {
  const isImage = doc.mimeType?.startsWith("image/");
  const isPdf =
    doc.mimeType === "application/pdf" || doc.filename?.endsWith(".pdf");

  if (doc.archivoUrl && isImage) {
    return (
      <img
        src={doc.archivoUrl}
        alt={doc.filename}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    );
  }
  if (doc.archivoUrl && isPdf) {
    return (
      <iframe
        src={`${doc.archivoUrl}#toolbar=0&navpanes=0`}
        title={doc.filename}
        className="h-full w-full"
        style={{ border: "none" }}
      />
    );
  }
  // Placeholder visual (sin archivo real). No carga nada.
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-2"
      style={{ backgroundColor: "#FAF6F1" }}
    >
      {isImage ? (
        <ImageIcon size={large ? 40 : 28} strokeWidth={1.5} style={{ color: "#B5AFA9" }} />
      ) : (
        <FileText size={large ? 40 : 28} strokeWidth={1.5} style={{ color: "#B5AFA9" }} />
      )}
      <span className="px-3 text-center font-mono text-[10px]" style={{ color: "#989396" }}>
        {doc.filename}
      </span>
      <span className="text-[10px]" style={{ color: "#B5AFA9" }}>
        Sin vista previa disponible
      </span>
    </div>
  );
}

export default function ValidarRechazarModal({
  documento,
  expediente,
  mode = "validate",
  extractedDataEditable = true,
  onValidar,
  onRechazar,
  onRevertir,
  onClose,
  loading = false,
}: ValidarRechazarModalProps) {
  const [editedExtractedData, setEditedExtractedData] = useState<
    Record<string, string>
  >(documento.datosExtraidos ?? {});
  const [isRejecting, setIsRejecting] = useState(mode === "reject");
  const [rejectReason, setRejectReason] = useState<MotivoRechazoCategoria | "">("");
  const [rejectComment, setRejectComment] = useState("");
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);

  // Resetear / sincronizar al cambiar el documento o el modo.
  useEffect(() => {
    setEditedExtractedData(documento.datosExtraidos ?? {});
    setIsRejecting(mode === "reject");
    setRejectReason("");
    setRejectComment("");
    setFullPreviewOpen(false);
  }, [documento, mode]);

  const ecfg = docEstadoConfig[documento.estado] ?? docEstadoConfig.pendiente;
  const esRechazoAutomatico = documento.rechazoAutomatico === true;

  // No se permite validar un documento descartado (regla de negocio).
  const puedeValidar = (documento.estado as string) !== "descartado";

  // Campos editables (todo datosExtraidos menos la confianza, que es metadato).
  const camposExtraidos = useMemo(
    () => Object.entries(editedExtractedData).filter(([k]) => k.toLowerCase() !== CONFIANZA_KEY),
    [editedExtractedData],
  );

  const confianza = useMemo(() => {
    const raw = documento.datosExtraidos?.[CONFIANZA_KEY];
    if (raw == null) return null;
    const n = parseInt(String(raw).replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  }, [documento]);

  const rejectComentarioObligatorio = rejectReason === "otro";
  const rejectValido =
    rejectReason !== "" &&
    (!rejectComentarioObligatorio || rejectComment.trim().length > 0);

  function updateCampo(key: string, value: string) {
    setEditedExtractedData((prev) => ({ ...prev, [key]: value }));
  }

  function handleValidate() {
    if (!puedeValidar || loading) return;
    onValidar(editedExtractedData);
  }

  function handleConfirmReject() {
    if (!rejectValido || loading) return;
    onRechazar(
      { categoria: rejectReason as MotivoRechazoCategoria, texto: rejectComment.trim() },
      editedExtractedData,
    );
  }

  const titulo = isRejecting ? "Rechazar documento" : "Validar documento";

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
          className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white"
          style={{ border: "1px solid #E5DED6", boxShadow: "0 20px 60px rgba(48,47,45,0.18)" }}
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* HEADER */}
          <div className="flex items-start justify-between gap-4 px-6 py-4" style={{ borderBottom: "1px solid #F0EBE5" }}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[16px] font-semibold" style={{ color: "#302F2D" }}>{titulo}</h2>
                <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: "#FCEEDB", color: "#A86518" }}>
                  {documento.tipo}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: ecfg.bg, color: ecfg.text }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ecfg.dot }} />
                  {ecfg.label}
                </span>
              </div>
              <p className="mt-1 text-[12px]" style={{ color: "#989396" }}>
                Revisa el archivo y los datos extraídos antes de tomar una decisión.
                {expediente && (
                  <span className="ml-1" style={{ color: "#B5AFA9" }}>
                    · {expediente.codigo} · {expediente.clienteNombre}
                  </span>
                )}
              </p>
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
          <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 md:grid-cols-[280px_1fr]">
            {/* IZQUIERDA — preview */}
            <div className="min-w-0">
              <div className="overflow-hidden rounded-xl" style={{ border: "1px solid #E5DED6", height: 320 }}>
                <PreviewVisual doc={documento} />
              </div>
              <button
                type="button"
                onClick={() => setFullPreviewOpen(true)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-white py-2 text-[12px] font-medium transition-colors"
                style={{ border: "1px solid #E5DED6", color: "#5C5957" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#B5AFA9")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#E5DED6")}
              >
                <Eye size={13} strokeWidth={1.75} />
                Ver completo
              </button>

              <div className="mt-3 space-y-2 rounded-xl p-3" style={{ backgroundColor: "#FAF6F1", border: "1px solid #F0EBE5" }}>
                <DocMeta label="Archivo" value={documento.filename} mono />
                <DocMeta label="Tipo" value={documento.tipo} />
                <DocMeta label="Canal" value={documento.canal} />
                <DocMeta label="Remitente" value={documento.remitente} />
                <DocMeta label="Recepción" value={formatRecepcion(documento.fechaRecepcion)} mono />
              </div>
            </div>

            {/* DERECHA — datos extraídos + acciones */}
            <div className="min-w-0">
              {/* Rechazo automático */}
              {esRechazoAutomatico && (
                <div className="mb-4 rounded-xl p-3.5" style={{ backgroundColor: "#FCEEDB", border: "1px solid #F0D9B8" }}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={15} strokeWidth={2} style={{ color: "#A86518" }} className="mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold" style={{ color: "#A86518" }}>Rechazo automático detectado</p>
                      <p className="mt-0.5 text-[12px]" style={{ color: "#8A6730" }}>
                        El sistema marcó este documento automáticamente. Puedes revertirlo si consideras que fue un error.
                      </p>
                      {documento.motivoRechazo?.texto && (
                        <p className="mt-1.5 text-[11px]" style={{ color: "#8A6730" }}>
                          <span className="font-medium">Motivo:</span> {documento.motivoRechazo.texto}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={onRevertir}
                        disabled={loading}
                        className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-50"
                        style={{ border: "1px solid #E0C79A", color: "#A86518" }}
                      >
                        <RotateCcw size={12} strokeWidth={2} />
                        Revertir rechazo automático
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Datos extraídos */}
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#5C5957" }}>Datos extraídos</h3>
                {confianza != null && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
                    style={
                      confianza >= 80
                        ? { backgroundColor: "#ECF0E8", color: "#536648" }
                        : { backgroundColor: "#F6EFDD", color: "#7A6435" }
                    }
                  >
                    Confianza {confianza}%
                  </span>
                )}
              </div>

              {confianza != null && confianza < 80 && (
                <div className="mb-3 mt-1.5 flex items-start gap-1.5 rounded-md px-2.5 py-2 text-[11px]" style={{ backgroundColor: "#F6EFDD", color: "#7A6435" }}>
                  <Info size={12} strokeWidth={2} className="mt-0.5 shrink-0" />
                  La confianza de extracción es baja. Revisa los campos antes de validar.
                </div>
              )}

              {camposExtraidos.length === 0 ? (
                <p className="mt-2 mb-4 text-[12px]" style={{ color: "#989396" }}>
                  Este documento no tiene datos extraídos.
                </p>
              ) : (
                <div className="mt-2 mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {camposExtraidos.map(([key, value]) => (
                    <div key={key} className="min-w-0">
                      <label className="mb-1 block text-[10px] uppercase tracking-wider" style={{ color: "#B5AFA9" }}>
                        {key}
                      </label>
                      {extractedDataEditable ? (
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => updateCampo(key, e.target.value)}
                          className="w-full rounded-md bg-white px-2.5 py-1.5 text-[12px] transition-colors"
                          style={{ border: "1px solid #E5DED6", color: "#302F2D", outline: "none" }}
                          onFocus={(e) => (e.currentTarget.style.borderColor = "#F19B42")}
                          onBlur={(e) => (e.currentTarget.style.borderColor = "#E5DED6")}
                        />
                      ) : (
                        <span className="block text-[12px] font-medium" style={{ color: "#302F2D" }}>{value || "—"}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Sección de rechazo */}
              <AnimatePresence initial={false}>
                {isRejecting && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: EASE_OUT }}
                    className="overflow-hidden"
                  >
                    <div className="mt-1 rounded-xl p-3.5" style={{ backgroundColor: "#FAF6F1", border: "1px solid #F0EBE5" }}>
                      <h4 className="mb-2 text-[13px] font-semibold" style={{ color: "#9C4B2E" }}>Motivo de rechazo</h4>
                      <select
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value as MotivoRechazoCategoria | "")}
                        className="w-full cursor-pointer rounded-md bg-white px-2.5 py-2 text-[12px]"
                        style={{ border: "1px solid #E5DED6", color: rejectReason ? "#302F2D" : "#989396", outline: "none" }}
                      >
                        <option value="" disabled>Selecciona un motivo…</option>
                        {motivoOptions.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>

                      <label className="mb-1 mt-3 block text-[11px] font-medium" style={{ color: "#5C5957" }}>
                        Describe brevemente qué debe corregir el cliente
                        {rejectComentarioObligatorio && <span style={{ color: "#9C4B2E" }}> *</span>}
                      </label>
                      <textarea
                        rows={3}
                        value={rejectComment}
                        onChange={(e) => setRejectComment(e.target.value)}
                        placeholder="Ej. La foto está borrosa, vuelve a enviar el documento completo y legible."
                        className="w-full resize-none rounded-md bg-white px-2.5 py-2 text-[12px] transition-colors"
                        style={{ border: "1px solid #E5DED6", color: "#302F2D", outline: "none" }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = "#F19B42")}
                        onBlur={(e) => (e.currentTarget.style.borderColor = "#E5DED6")}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* FOOTER */}
          <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4" style={{ borderTop: "1px solid #F0EBE5", backgroundColor: "#FAF6F1" }}>
            {!isRejecting ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md bg-white px-4 py-2 text-[12px] font-medium transition-colors"
                  style={{ border: "1px solid #E5DED6", color: "#5C5957" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#B5AFA9")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#E5DED6")}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => setIsRejecting(true)}
                  className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[12px] font-medium transition-colors"
                  style={{ backgroundColor: "#F6E6DF", color: "#9C4B2E" }}
                >
                  <XCircle size={13} />
                  Rechazar
                </button>
                <motion.button
                  type="button"
                  onClick={handleValidate}
                  disabled={!puedeValidar || loading}
                  whileHover={puedeValidar && !loading ? { scale: 1.02 } : undefined}
                  whileTap={puedeValidar && !loading ? { scale: 0.98 } : undefined}
                  className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[12px] font-medium text-white disabled:cursor-not-allowed"
                  style={{ backgroundColor: puedeValidar && !loading ? "#536648" : "#C7CBC1" }}
                >
                  <CheckCircle2 size={13} strokeWidth={2.25} />
                  {loading ? "Guardando…" : "Validar"}
                </motion.button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => (mode === "reject" ? onClose() : setIsRejecting(false))}
                  className="rounded-md bg-white px-4 py-2 text-[12px] font-medium transition-colors"
                  style={{ border: "1px solid #E5DED6", color: "#5C5957" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#B5AFA9")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#E5DED6")}
                >
                  Cancelar rechazo
                </button>
                <motion.button
                  type="button"
                  onClick={handleConfirmReject}
                  disabled={!rejectValido || loading}
                  whileHover={rejectValido && !loading ? { scale: 1.02 } : undefined}
                  whileTap={rejectValido && !loading ? { scale: 0.98 } : undefined}
                  className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[12px] font-medium text-white disabled:cursor-not-allowed"
                  style={{ backgroundColor: rejectValido && !loading ? "#9C4B2E" : "#D8B6A8" }}
                >
                  <XCircle size={13} strokeWidth={2.25} />
                  {loading ? "Guardando…" : "Confirmar rechazo"}
                </motion.button>
              </>
            )}
          </div>
        </motion.div>

        {/* VISTA COMPLETA (overlay interno) */}
        <AnimatePresence>
          {fullPreviewOpen && (
            <motion.div
              className="fixed inset-0 z-[60] flex items-center justify-center p-6"
              style={{ backgroundColor: "rgba(48,47,45,0.55)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => { e.stopPropagation(); setFullPreviewOpen(false); }}
            >
              <motion.div
                className="relative overflow-hidden rounded-2xl bg-white"
                style={{ width: "min(640px, 92vw)", height: "min(820px, 84vh)", boxShadow: "0 20px 60px rgba(48,47,45,0.3)" }}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setFullPreviewOpen(false)}
                  className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: "rgba(48,47,45,0.6)" }}
                  aria-label="Cerrar vista completa"
                >
                  <X size={16} />
                </button>
                <PreviewVisual doc={documento} large />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}

function DocMeta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-20 shrink-0 text-[10px] uppercase tracking-wider" style={{ color: "#B5AFA9" }}>{label}</span>
      <span className={`min-w-0 break-words text-[12px] ${mono ? "font-mono" : ""}`} style={{ color: "#5C5957" }}>{value || "—"}</span>
    </div>
  );
}
