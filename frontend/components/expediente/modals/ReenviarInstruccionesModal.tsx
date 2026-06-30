"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Send, X } from "lucide-react";

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

type Props = {
  open: boolean;
  remitente: string;
  destinatario: string;
  asunto: string;
  texto: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export default function ReenviarInstruccionesModal({
  open,
  remitente,
  destinatario,
  asunto,
  texto,
  loading = false,
  onConfirm,
  onClose,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          style={{ backgroundColor: "rgba(48,47,45,0.4)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:max-h-[85vh] sm:rounded-2xl"
            style={{ border: "1px solid #E5DED6", boxShadow: "0 20px 60px rgba(48,47,45,0.18)" }}
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* HEADER */}
            <div className="flex items-start justify-between gap-4 px-4 sm:px-6 py-4" style={{ borderBottom: "1px solid #F0EBE5" }}>
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: "#F3EDE5" }}>
                  <Send size={14} style={{ color: "#C07B3A" }} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[16px] font-semibold" style={{ color: "#302F2D" }}>
                    Reenviar instrucciones por correo
                  </h2>
                  <p className="mt-0.5 text-[12px]" style={{ color: "#989396" }}>
                    Vista previa del correo que se enviará al cliente del expediente.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-11 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-md transition-colors"
                style={{ color: "#989396" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#FAF6F1"; e.currentTarget.style.color = "#302F2D"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#989396"; }}
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            {/* BODY */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
              {/* Email metadata */}
              <div className="mb-4 rounded-xl overflow-hidden" style={{ border: "1px solid #F0EBE5" }}>
                {[
                  { label: "DE", value: remitente },
                  { label: "PARA", value: destinatario },
                  { label: "ASUNTO", value: asunto },
                ].map(({ label, value }, i, arr) => (
                  <div
                    key={label}
                    className="flex items-baseline gap-3 px-4 py-2.5"
                    style={{
                      borderBottom: i < arr.length - 1 ? "1px solid #F0EBE5" : undefined,
                      backgroundColor: "#FAF6F1",
                    }}
                  >
                    <span
                      className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: "#B5AFA9" }}
                    >
                      {label}
                    </span>
                    <span className="text-[13px] break-all" style={{ color: "#302F2D" }}>
                      {value || "—"}
                    </span>
                  </div>
                ))}
              </div>

              {/* Email body preview */}
              <div
                className="max-h-[260px] overflow-y-auto rounded-xl px-4 py-4 text-[13px] leading-relaxed whitespace-pre-line"
                style={{ border: "1px solid #F0EBE5", color: "#302F2D", backgroundColor: "#FFFFFF" }}
              >
                {texto}
              </div>
            </div>

            {/* FOOTER */}
            <div
              className="flex flex-wrap items-center justify-end gap-2 px-4 sm:px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4"
              style={{ borderTop: "1px solid #F0EBE5", backgroundColor: "#FAF6F1" }}
            >
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-md bg-white px-4 py-2 text-[12px] font-medium transition-colors"
                style={{ border: "1px solid #E5DED6", color: "#5C5957" }}
                onMouseEnter={(e) => { if (!loading) e.currentTarget.style.borderColor = "#B5AFA9"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E5DED6"; }}
              >
                Cancelar
              </button>
              <motion.button
                type="button"
                onClick={onConfirm}
                disabled={loading || !destinatario}
                whileHover={!loading && destinatario ? { scale: 1.02 } : undefined}
                whileTap={!loading && destinatario ? { scale: 0.98 } : undefined}
                className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[12px] font-medium text-white disabled:cursor-not-allowed"
                style={{ backgroundColor: loading || !destinatario ? "#D8B6A8" : "#C07B3A" }}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin" width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <circle cx="6.5" cy="6.5" r="5" stroke="white" strokeOpacity="0.4" strokeWidth="2" />
                      <path d="M6.5 1.5a5 5 0 0 1 5 5" stroke="white" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Enviando…
                  </>
                ) : (
                  <>
                    <Send size={13} strokeWidth={2} />
                    Enviar correo
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
