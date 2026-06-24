"use client";

import { Sparkles, CheckCircle, XCircle } from "lucide-react";
import type { ConsultaLLM } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";

type RespuestaLLMModalProps = {
  consulta: ConsultaLLM;
  onClose: () => void;
};

export default function RespuestaLLMModal({
  consulta,
  onClose,
}: RespuestaLLMModalProps) {
  const esSi = consulta.respuesta === "si";

  return (
    <Modal open onClose={onClose} title="Respuesta IA">
      <div className="flex flex-col gap-4">
        {/* Pregunta */}
        <div className="flex items-start gap-2">
          <Sparkles
            size={16}
            style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: 2 }}
          />
          <p
            className="text-sm font-medium"
            style={{ color: "var(--color-text)" }}
          >
            {consulta.pregunta}
          </p>
        </div>

        {/* Respuesta */}
        <div
          className="flex items-center gap-2 rounded-lg p-3"
          style={{
            backgroundColor: esSi
              ? "var(--color-success-bg)"
              : "var(--color-coral-bg)",
          }}
        >
          {esSi ? (
            <CheckCircle
              size={18}
              style={{ color: "var(--color-success)", flexShrink: 0 }}
            />
          ) : (
            <XCircle
              size={18}
              style={{ color: "var(--color-coral)", flexShrink: 0 }}
            />
          )}
          <span
            className="text-sm font-semibold"
            style={{
              color: esSi ? "var(--color-success)" : "var(--color-coral-text)",
            }}
          >
            {esSi ? "Sí" : "No"}
          </span>
        </div>

        {/* Razón */}
        <div className="flex flex-col gap-1">
          <span
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--color-tertiary)" }}
          >
            Razonamiento
          </span>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {consulta.razon}
          </p>
        </div>

        {/* Disclaimer */}
        <div
          className="rounded-lg p-3 text-xs leading-relaxed"
          style={{
            backgroundColor: "var(--color-bg)",
            color: "var(--color-muted)",
          }}
        >
          {consulta.disclaimer}
        </div>
      </div>
    </Modal>
  );
}
