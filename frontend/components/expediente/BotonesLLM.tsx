"use client";

import { Sparkles, ChevronRight } from "lucide-react";

type BotonesLLMProps = {
  onConsultar: (pregunta: string) => void;
  loading: boolean;
};

const preguntas = [
  "¿Hay que avisar al SAT?",
  "¿Se puede pagar en efectivo?",
];

export default function BotonesLLM({ onConsultar, loading }: BotonesLLMProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 mb-1">
        <Sparkles size={14} style={{ color: "var(--color-accent)" }} />
        <h3
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-tertiary)" }}
        >
          Consultas IA
        </h3>
      </div>

      {preguntas.map((pregunta) => (
        <button
          key={pregunta}
          type="button"
          disabled={loading}
          onClick={() => onConsultar(pregunta)}
          className="flex items-center justify-between gap-2 w-full rounded-lg border px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-50"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text)",
            backgroundColor: "var(--color-surface)",
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.backgroundColor = "var(--color-bg)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-surface)";
          }}
        >
          {pregunta}
          <ChevronRight
            size={16}
            style={{ color: "var(--color-muted)", flexShrink: 0 }}
          />
        </button>
      ))}
    </div>
  );
}
