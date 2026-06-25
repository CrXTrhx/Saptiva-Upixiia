"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Sparkles, Info, Check, Copy } from "lucide-react";
import type { ConsultaLLM } from "@/lib/types";

// =============================================================================
// P11 — Modal Respuesta del asistente normativo (LLM)
// -----------------------------------------------------------------------------
// Integrado en P5. NO llama al LLM ni a APIs: solo muestra la consulta que ya
// recibe por props (P5 la obtuvo vía expedientesService.consultarLLM). El evento
// "consulta_llm" se registra en el historial desde P5 (handleConsultarLLM), por
// eso este modal no vuelve a guardar nada (evita duplicados).
// =============================================================================

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Razón visible: máximo 30 palabras.
function truncateWords(text = "", maxWords = 30): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ") + "…";
}

type RespuestaLLMModalProps = {
  consulta: ConsultaLLM;
  expediente?: { codigo: string; clienteNombre: string } | null;
  onClose: () => void;
};

export default function RespuestaLLMModal({
  consulta,
  expediente,
  onClose,
}: RespuestaLLMModalProps) {
  const esSi = consulta.respuesta === "si";
  const tipoConsulta = /sat/i.test(consulta.pregunta) ? "SAT" : "Efectivo";
  const razon = truncateWords(consulta.razon, 30);

  // Momento de la consulta (estable durante la vida del modal).
  const [consultadoEn] = useState(() => new Date());

  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  // Colores de decisión: "Sí" implica atención (ámbar), "No" no implica acción (verde).
  const decision = esSi
    ? { label: "Sí", bg: "#F6EFDD", text: "#7A6435", dot: "#C9A85C" }
    : { label: "No", bg: "#ECF0E8", text: "#536648", dot: "#8FA585" };

  async function handleCopy() {
    const txt = `${consulta.pregunta}\n\n${decision.label}. ${razon}\n\n${consulta.disclaimer}`;
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      // Sin alert: si falla el portapapeles, simplemente no se marca como copiado.
    }
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
              <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: "#FCEEDB" }}>
                <Sparkles size={15} style={{ color: "#A86518" }} />
              </span>
              <div className="min-w-0">
                <h2 className="text-[16px] font-semibold" style={{ color: "#302F2D" }}>Respuesta del asistente</h2>
                <p className="mt-0.5 text-[12px]" style={{ color: "#989396" }}>
                  Consulta orientativa para apoyar la revisión de cumplimiento.
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
            {/* Pregunta */}
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider" style={{ color: "#B5AFA9" }}>
              Pregunta realizada
            </p>
            <p className="mb-4 text-[14px] font-medium" style={{ color: "#302F2D" }}>{consulta.pregunta}</p>

            {/* Respuesta */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: 0.05, ease: EASE_OUT }}
              className="rounded-xl p-4"
              style={{ backgroundColor: "#FAF6F1", border: "1px solid #F0EBE5" }}
            >
              <div className="flex items-center gap-2.5">
                <motion.span
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.1, ease: EASE_OUT }}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[15px] font-bold"
                  style={{ backgroundColor: decision.bg, color: decision.text }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: decision.dot }} />
                  {decision.label}
                </motion.span>
              </div>
              <p className="mt-3 text-[10px] font-medium uppercase tracking-wider" style={{ color: "#B5AFA9" }}>Razón</p>
              <p className="mt-0.5 text-[13px] leading-relaxed" style={{ color: "#5C5957" }}>{razon}</p>
            </motion.div>

            {/* Disclaimer fijo */}
            <div className="mt-4 flex items-start gap-2 rounded-lg p-3" style={{ backgroundColor: "#F5F0EA" }}>
              <Info size={13} strokeWidth={2} style={{ color: "#989396" }} className="mt-0.5 shrink-0" />
              <p className="text-[11px] leading-relaxed" style={{ color: "#5C5957" }}>{consulta.disclaimer}</p>
            </div>

            {/* Metadata */}
            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]" style={{ color: "#B5AFA9" }}>
              {expediente && (
                <>
                  <span className="font-mono tabular-nums" style={{ color: "#989396" }}>{expediente.codigo}</span>
                  <span>·</span>
                  <span>{expediente.clienteNombre}</span>
                  <span>·</span>
                </>
              )}
              <span className="tabular-nums">
                {consultadoEn.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}{" "}
                {consultadoEn.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span>·</span>
              <span>Consulta: {tipoConsulta}</span>
            </div>
          </div>

          {/* FOOTER */}
          <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4" style={{ borderTop: "1px solid #F0EBE5", backgroundColor: "#FAF6F1" }}>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-md bg-white px-3.5 py-2 text-[12px] font-medium transition-colors"
              style={{ border: "1px solid #E5DED6", color: copied ? "#536648" : "#5C5957" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#B5AFA9")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#E5DED6")}
            >
              {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={1.75} />}
              {copied ? "Copiado" : "Copiar respuesta"}
            </button>
            <motion.button
              type="button"
              onClick={onClose}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="rounded-md px-4 py-2 text-[12px] font-medium text-white"
              style={{ backgroundColor: "#302F2D" }}
            >
              Cerrar
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
