"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { StickyNote } from "lucide-react";
import type { Nota } from "@/lib/types";
import { Button } from "@/components/ui/Button";

type NotasInternasProps = {
  notas: Nota[];
  onAgregar: (texto: string) => void;
  loading: boolean;
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotasInternas({
  notas,
  onAgregar,
  loading,
}: NotasInternasProps) {
  const [texto, setTexto] = useState("");

  function handleSubmit() {
    const trimmed = texto.trim();
    if (!trimmed) return;
    onAgregar(trimmed);
    setTexto("");
  }

  return (
    <div className="flex flex-col gap-3">
      <h3
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-tertiary)" }}
      >
        Notas internas
      </h3>

      {/* Input area */}
      <div className="flex flex-col gap-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe una nota..."
          rows={3}
          className="w-full rounded-lg border px-3.5 py-2.5 text-sm transition-colors focus:outline-2 focus:outline-offset-0 focus:outline-[var(--color-accent)] resize-none"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-text)",
            backgroundColor: "var(--color-surface)",
          }}
        />
        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!texto.trim() || loading}
            loading={loading}
            className="!text-xs !px-3 !py-1.5"
          >
            <StickyNote size={13} />
            Agregar nota
          </Button>
        </div>
      </div>

      {/* Notes list */}
      {notas.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Sin notas aún
        </p>
      ) : (
        <AnimatePresence initial={false}>
          {notas.map((nota) => (
            <motion.div
              key={nota.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--color-border-inner)" }}
            >
              <p
                className="text-sm whitespace-pre-wrap"
                style={{ color: "var(--color-text)" }}
              >
                {nota.texto}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {nota.autor}
                </span>
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                  {formatTimestamp(nota.timestamp)}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}
