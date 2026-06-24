"use client";

import { useState, useRef } from "react";
import { Upload, AlertTriangle } from "lucide-react";
import type { DocumentoRequerido } from "@/lib/types";
import { DOCUMENTOS_REQUERIDOS } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type SubirDocumentoModalProps = {
  modo: "nuevo" | "reemplazo";
  documentoId?: string;
  onConfirm: (tipo: DocumentoRequerido, archivo: File) => void;
  onClose: () => void;
  loading: boolean;
};

export default function SubirDocumentoModal({
  modo,
  documentoId,
  onConfirm,
  onClose,
  loading,
}: SubirDocumentoModalProps) {
  const [tipo, setTipo] = useState<DocumentoRequerido>("INE");
  const [archivo, setArchivo] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    if (!archivo) return;
    onConfirm(tipo, archivo);
  }

  const title =
    modo === "reemplazo" ? "Reemplazar documento" : "Subir documento";

  return (
    <Modal open onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        {/* Tipo selector */}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Tipo de documento
          </label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as DocumentoRequerido)}
            disabled={modo === "reemplazo"}
            className="w-full rounded-lg border px-3 py-2 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text)",
              backgroundColor:
                modo === "reemplazo"
                  ? "var(--color-disabled-bg)"
                  : "var(--color-surface)",
            }}
          >
            {DOCUMENTOS_REQUERIDOS.map((dr) => (
              <option key={dr} value={dr}>
                {dr}
              </option>
            ))}
          </select>
        </div>

        {/* File input */}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Archivo
          </label>
          <div
            className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-6 cursor-pointer hover:bg-[var(--color-bg-hover)] transition-colors"
            style={{ borderColor: "var(--color-border)" }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={20} style={{ color: "var(--color-muted)" }} />
            <div className="flex flex-col">
              <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                {archivo ? archivo.name : "Haz clic para seleccionar archivo"}
              </span>
              {archivo && (
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                  {(archivo.size / 1024).toFixed(1)} KB
                </span>
              )}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setArchivo(f);
            }}
            className="hidden"
          />
        </div>

        {/* Reemplazo warning */}
        {modo === "reemplazo" && (
          <div
            className="flex items-start gap-2 rounded-lg p-3 text-sm"
            style={{
              backgroundColor: "var(--color-amber-bg)",
              color: "var(--color-amber-text)",
            }}
          >
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>
              El documento actual será marcado como reemplazado y se conservará
              como versión anterior.
            </span>
          </div>
        )}

        {/* Confirm */}
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!archivo}
          loading={loading}
          className="w-full"
        >
          <Upload size={15} />
          {modo === "reemplazo" ? "Reemplazar" : "Subir documento"}
        </Button>
      </div>
    </Modal>
  );
}
