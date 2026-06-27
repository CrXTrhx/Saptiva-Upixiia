"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Upload,
  FileText,
  Image as ImageIcon,
  Replace,
  AlertTriangle,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import type { Documento, DocumentoRequerido } from "@/lib/types";
import { DOCUMENTOS_REQUERIDOS, DOCUMENTO_REQUERIDO_LABELS } from "@/lib/types";

// =============================================================================
// P9 — Modal Subir / Reemplazar Documento
// -----------------------------------------------------------------------------
// Integrado en P5. No hace upload real, no llama APIs, no procesa el archivo:
// solo valida (tipo/tamaño/formato), guarda el File en estado local y lo devuelve
// a P5 vía onConfirm(tipo, archivo). P5 actualiza documentos/checklist/next
// steps/historial. El objectURL es solo para preview local (se revoca al limpiar).
// =============================================================================

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const EXT_PERMITIDAS = ["pdf", "jpg", "jpeg", "png"];

const docEstadoConfig: Record<string, { label: string; bg: string; text: string }> = {
  PENDING: { label: "Pendiente", bg: "#EAE7E6", text: "#5C5957" },
  RECEIVED: { label: "Recibido", bg: "#EBEEF2", text: "#4F5A6B" },
  VALIDATED: { label: "Validado", bg: "#ECF0E8", text: "#536648" },
  REJECTED: { label: "Rechazado", bg: "#F6E6DF", text: "#9C4B2E" },
  EXPIRED: { label: "Vencido", bg: "#F6EFDD", text: "#7A6435" },
  REPLACED: { label: "Reemplazado", bg: "#EFECE9", text: "#7A7470" },
};

type SubirDocumentoModalProps = {
  modo: "nuevo" | "reemplazo";
  /** Contexto opcional del expediente para el header. */
  expediente?: { codigo: string; clienteNombre: string } | null;
  /** Documento que se reemplaza (modo reemplazo). */
  documentoActual?: Documento | null;
  onConfirm: (tipo: DocumentoRequerido, archivo: File) => void;
  onClose: () => void;
  loading?: boolean;
  tiposDisponibles?: DocumentoRequerido[];
};

function getExt(name = "") {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function esImagenFile(file: File): boolean {
  return file.type.startsWith("image/") || ["jpg", "jpeg", "png"].includes(getExt(file.name));
}

function formatRecepcion(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SubirDocumentoModal({
  modo,
  expediente,
  documentoActual,
  onConfirm,
  onClose,
  loading = false,
  tiposDisponibles,
}: SubirDocumentoModalProps) {
  const availableTipos =
    modo === "reemplazo" || tiposDisponibles === undefined
      ? DOCUMENTOS_REQUERIDOS
      : tiposDisponibles;
  const [tipo, setTipo] = useState<DocumentoRequerido>(
    documentoActual?.tipo ?? availableTipos[0] ?? "OFFICIAL_ID",
  );
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Limpiar el objectURL del preview al cambiar o desmontar.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function validarArchivo(file: File): string {
    const ext = getExt(file.name);
    if (!EXT_PERMITIDAS.includes(ext)) {
      return "Formato no permitido. Usa PDF, JPG o PNG.";
    }
    if (file.size > MAX_BYTES) {
      return "El archivo excede el tamaño máximo de 10 MB.";
    }
    return "";
  }

  function setFile(file: File | null) {
    // Revocar preview anterior
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (!file) {
      setArchivo(null);
      setError("");
      return;
    }
    const err = validarArchivo(file);
    if (err) {
      setArchivo(null);
      setError(err);
      return;
    }
    setError("");
    setArchivo(file);
    if (esImagenFile(file)) {
      setPreviewUrl(URL.createObjectURL(file));
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setFile(file);
  }

  function handleSubmit() {
    if (!archivo || error || loading) return;
    onConfirm(tipo, archivo);
  }

  const esReemplazo = modo === "reemplazo";
  const titulo = esReemplazo ? "Reemplazar documento" : "Subir documento";
  const subtitulo = esReemplazo
    ? "Sube una nueva versión del documento seleccionado."
    : "Agrega un documento al expediente actual.";
  const submitDisabled = !tipo || !archivo || !!error || loading;
  const ecfg = documentoActual
    ? docEstadoConfig[documentoActual.estado] ?? docEstadoConfig.PENDING
    : null;

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
          className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white"
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
              <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: "#FCEEDB" }}>
                {esReemplazo ? <Replace size={15} style={{ color: "#A86518" }} /> : <Upload size={15} style={{ color: "#A86518" }} />}
              </span>
              <div className="min-w-0">
                <h2 className="text-[16px] font-semibold" style={{ color: "#302F2D" }}>{titulo}</h2>
                <p className="mt-0.5 text-[12px]" style={{ color: "#989396" }}>
                  {subtitulo}
                  {expediente && (
                    <span className="ml-1" style={{ color: "#B5AFA9" }}>
                      · {expediente.codigo} · {expediente.clienteNombre}
                    </span>
                  )}
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
            {/* Aviso de reemplazo */}
            {esReemplazo && documentoActual && (
              <div className="mb-4 rounded-xl p-3.5" style={{ backgroundColor: "#FCEEDB", border: "1px solid #F0D9B8" }}>
                <div className="flex items-start gap-2">
                  <AlertTriangle size={15} strokeWidth={2} style={{ color: "#A86518" }} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[12px]" style={{ color: "#8A6730" }}>
                      Esto reemplazará el documento actual, que quedará en el histórico.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: "#5C5957" }}>
                      <span className="font-medium" style={{ color: "#302F2D" }}>{DOCUMENTO_REQUERIDO_LABELS[documentoActual.tipo] ?? documentoActual.tipo}</span>
                      <span style={{ color: "#D8CFC9" }}>·</span>
                      <span className="font-mono">{documentoActual.filename}</span>
                      {ecfg && (
                        <>
                          <span style={{ color: "#D8CFC9" }}>·</span>
                          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: ecfg.bg, color: ecfg.text }}>{ecfg.label}</span>
                        </>
                      )}
                      <span style={{ color: "#D8CFC9" }}>·</span>
                      <span className="tabular-nums">{formatRecepcion(documentoActual.fechaRecepcion)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tipo de documento */}
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider" style={{ color: "#5C5957" }}>
              Tipo de documento
            </label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as DocumentoRequerido)}
              className="mb-4 w-full cursor-pointer rounded-lg px-3 py-2.5 text-[13px] transition-colors"
              style={{ border: "1px solid #E5DED6", color: "#302F2D", backgroundColor: "#FFFFFF", outline: "none" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#F19B42")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#E5DED6")}
              disabled={availableTipos.length === 0}
            >
              {availableTipos.map((dr) => (
                <option key={dr} value={dr}>{DOCUMENTO_REQUERIDO_LABELS[dr]}</option>
              ))}
            </select>
            {availableTipos.length === 0 && (
              <p className="mb-3 text-[12px] text-[#9C4B2E]">Ya no quedan tipos de documento disponibles para subir.</p>
            )}

            {/* Dropzone / preview */}
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider" style={{ color: "#5C5957" }}>
              Archivo
            </label>

            <AnimatePresence mode="wait">
              {!archivo ? (
                <motion.div
                  key="dropzone"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl px-4 py-10 text-center transition-colors"
                  style={{
                    border: `1.5px dashed ${dragActive ? "#F19B42" : "#D8CFC9"}`,
                    backgroundColor: dragActive ? "#FCEEDB" : "#FAF6F1",
                  }}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E5DED6" }}>
                    <Upload size={18} style={{ color: "#A86518" }} />
                  </span>
                  <span className="text-[13px] font-medium" style={{ color: "#302F2D" }}>
                    Arrastra un archivo aquí o haz clic para seleccionar
                  </span>
                  <span className="text-[11px]" style={{ color: "#989396" }}>
                    PDF, JPG o PNG · máximo 10 MB
                  </span>
                </motion.div>
              ) : (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                  className="flex items-center gap-3 rounded-xl p-3"
                  style={{ backgroundColor: "#FAF6F1", border: "1px solid #F0EBE5" }}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md" style={{ backgroundColor: "#FFFFFF", border: "1px solid #E5DED6" }}>
                    {previewUrl ? (
                      <img src={previewUrl} alt={archivo.name} className="h-full w-full object-cover" />
                    ) : esImagenFile(archivo) ? (
                      <ImageIcon size={20} style={{ color: "#B5AFA9" }} />
                    ) : (
                      <FileText size={20} style={{ color: "#B5AFA9" }} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium" style={{ color: "#302F2D" }}>{archivo.name}</p>
                    <p className="text-[11px] tabular-nums" style={{ color: "#989396" }}>
                      {formatSize(archivo.size)} · {getExt(archivo.name).toUpperCase() || archivo.type || "—"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors"
                    style={{ color: "#989396" }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#F6E6DF"; e.currentTarget.style.color = "#9C4B2E"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#989396"; }}
                    aria-label="Quitar archivo"
                  >
                    <Trash2 size={14} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />

            {/* Error */}
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
              Cancelar
            </button>
            <motion.button
              type="button"
              onClick={handleSubmit}
              disabled={submitDisabled}
              whileHover={!submitDisabled ? { scale: 1.02 } : undefined}
              whileTap={!submitDisabled ? { scale: 0.98 } : undefined}
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[12px] font-medium text-white disabled:cursor-not-allowed"
              style={{ backgroundColor: submitDisabled ? "#E7C9A0" : "#F19B42" }}
            >
              {esReemplazo ? <Replace size={13} strokeWidth={2} /> : <CheckCircle2 size={13} strokeWidth={2.25} />}
              {loading ? "Guardando…" : esReemplazo ? "Reemplazar documento" : "Subir"}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
