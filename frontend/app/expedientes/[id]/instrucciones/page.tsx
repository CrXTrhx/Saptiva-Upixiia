"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  MessageSquare,
} from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { expedientesService } from "@/services/expedientesService";
import { configSistema } from "@/lib/config-sistema";
import { TIPO_OPERACION_LABELS } from "@/lib/reglas-negocio";
import type { Expediente, TipoOperacion } from "@/lib/types";

// --- EXAMPLE_PROPS (for reference — data comes from service, not props) ---
// expediente: { id:"19", codigo:"EXP-2026-00019", clienteNombre:"María García",
//   clienteTelefono:"5598765432", clienteCorreo:"maria@correo.com",
//   estado:"en_captura", fechaCreacion:"2026-06-24T...", capturista:"Administrador",
//   tipoOperacion:"blindaje" }
// configSistema: { whatsappSistema:"+52 55 1234 5678", correoSistema:"documentos@centur.saptiva.com" }

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const EASE_INOUT = [0.65, 0, 0.35, 1] as const;

type Phase = "creating" | "code" | "success" | "done";

// --- Animated entry sequence ---

// --- Summary field ---

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--color-tertiary)] mb-0.5">
        {label}
      </p>
      <p className="text-[13px] text-[var(--color-text)]">{value || "—"}</p>
    </div>
  );
}

// --- Roadmap ---

type StepStatus = "done" | "current" | "next" | "pending";

const STEPS: { label: string; status: StepStatus }[] = [
  { label: "Nueva venta", status: "done" },
  { label: "Instrucciones generadas", status: "current" },
  { label: "Captura / recepción de documentos", status: "next" },
  { label: "Validación", status: "pending" },
  { label: "Expediente completo", status: "pending" },
];

function RoadmapStep({
  step,
  index,
  revealed,
}: {
  step: (typeof STEPS)[number];
  index: number;
  revealed: boolean;
}) {
  const isLast = index === STEPS.length - 1;
  return (
    <motion.div
      className="flex items-start gap-3 relative"
      initial={revealed ? { opacity: 0, x: 8 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        delay: 0.5 + index * 0.07,
        duration: 0.35,
        ease: EASE_OUT as [number, number, number, number],
      }}
    >
      <div className="flex flex-col items-center shrink-0">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
            step.status === "done"
              ? "bg-[var(--color-success)] text-white"
              : step.status === "current"
                ? "bg-[var(--color-accent)] text-white"
                : "bg-[var(--color-border-inner)] text-[var(--color-tertiary)]"
          }`}
        >
          {step.status === "done" ? (
            <Check size={10} strokeWidth={3} />
          ) : (
            index + 1
          )}
        </span>
        {!isLast && (
          <span className="w-px h-3 bg-[var(--color-border)]" />
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`text-xs leading-5 ${
            step.status === "current"
              ? "font-medium text-[var(--color-text)]"
              : step.status === "done"
                ? "text-[var(--color-muted)]"
                : "text-[var(--color-tertiary)]"
          }`}
        >
          {step.label}
        </span>
        {step.status === "next" && (
          <span className="text-[9px] font-semibold uppercase tracking-wider bg-[var(--color-accent-light)] text-[var(--color-accent-text-dark)] px-1.5 py-0.5 rounded">
            Siguiente
          </span>
        )}
      </div>
    </motion.div>
  );
}

// --- Main page ---

export default function InstruccionesPage() {
  return (
    <ProtectedRoute>
      <InstruccionesContent />
    </ProtectedRoute>
  );
}

function InstruccionesContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  // --- Data loading ---
  const [expediente, setExpediente] = useState<Expediente | null>(null);
  const [dataStatus, setDataStatus] = useState<
    "loading" | "loaded" | "notFound" | "error"
  >("loading");

  useEffect(() => {
    expedientesService
      .getExpediente(id)
      .then((exp) => {
        if (exp) {
          setExpediente(exp);
          setDataStatus("loaded");
        } else {
          setDataStatus("notFound");
        }
      })
      .catch(() => setDataStatus("error"));
  }, [id]);

  // --- Entry animation phases ---
  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [phase, setPhase] = useState<Phase>(prefersReduced ? "done" : "creating");
  const [overlayExited, setOverlayExited] = useState(prefersReduced);

  useEffect(() => {
    if (prefersReduced) return;
    let cancelled = false;
    function schedule(fn: () => void, ms: number) {
      return setTimeout(() => { if (!cancelled) fn(); }, ms);
    }
    const t1 = schedule(() => setPhase("code"), 1000);
    const t2 = schedule(() => setPhase("success"), 1750);
    const t3 = schedule(() => setPhase("done"), 3250);
    return () => { cancelled = true; clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [prefersReduced]);

  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => setOverlayExited(true), 500);
    return () => clearTimeout(t);
  }, [phase]);

  const revealed = overlayExited && dataStatus === "loaded";

  // --- Copy ---
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const copyTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => copyTimersRef.current.forEach(clearTimeout);
  }, []);

  const mensaje = useMemo(() => {
    if (!expediente) return "";
    const primerNombre = expediente.clienteNombre?.split(" ")[0] ?? "";
    const codigo = expediente.codigo;
    return [
      `Hola ${primerNombre},`,
      "",
      `Tu expediente ha sido creado con el código ${codigo}.`,
      "",
      "Para continuar con el proceso, necesitamos los siguientes documentos:",
      "• INE (frente y vuelta)",
      "• CURP",
      "• Constancia de Situación Fiscal",
      "• Comprobante de domicilio",
      "",
      "📧 Envíalos por correo a:",
      `   ${configSistema.correoSistema}`,
      "",
      "Sigue estas instrucciones para que podamos procesarlos automáticamente:",
      `   • Asunto del correo: ${codigo}`,
      `   • En el cuerpo, escribe tu nombre y tu código ${codigo}`,
      "   • Adjunta los documentos en PDF o foto (máx. 15 MB por archivo)",
      "   • Puedes mandar todo en un solo correo o uno por documento",
      "",
      `📱 También puedes enviarlos por WhatsApp: ${configSistema.whatsappSistema}`,
      `   (incluye tu código ${codigo} en el mensaje)`,
      "",
      `Es muy importante incluir el código ${codigo} para identificar tu documentación.`,
      "",
      "¡Gracias!",
    ].join("\n");
  }, [expediente]);

  async function handleCopy() {
    copyTimersRef.current.forEach(clearTimeout);
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(mensaje);
      setCopied(true);
      setToast(true);
      const t1 = setTimeout(() => setCopied(false), 2000);
      const t2 = setTimeout(() => setToast(false), 2500);
      copyTimersRef.current = [t1, t2];
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = mensaje;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        setToast(true);
        const t1 = setTimeout(() => setCopied(false), 2000);
        const t2 = setTimeout(() => setToast(false), 2500);
        copyTimersRef.current = [t1, t2];
      } catch {
        setCopyError(true);
        const t = setTimeout(() => setCopyError(false), 3000);
        copyTimersRef.current = [t];
      }
    }
  }

  // --- Loading / error states ---
  if (dataStatus === "notFound") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-base font-medium text-[var(--color-text)]">
          Expediente no encontrado
        </p>
        <p className="text-sm text-[var(--color-muted)]">
          No se encontró un expediente con ID {id}.
        </p>
        <button
          onClick={() => router.push("/dashboard")}
          className="text-sm text-[var(--color-accent)] hover:underline cursor-pointer"
        >
          Volver al Dashboard
        </button>
      </div>
    );
  }

  if (dataStatus === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-base font-medium text-[var(--color-text)]">
          Error al cargar el expediente
        </p>
        <p className="text-sm text-[var(--color-muted)]">
          Ocurrió un error al obtener los datos. Intenta de nuevo.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-[var(--color-accent)] hover:underline cursor-pointer"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const codigo = expediente?.codigo ?? "—";

  return (
    <div className="min-h-screen">
      {/* Entry animation overlay */}
      {!overlayExited && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-450"
          style={{
            backgroundColor: "var(--color-bg)",
            opacity: phase === "done" ? 0 : 1,
            pointerEvents: phase === "done" ? "none" : "auto",
          }}
        >
          <AnimatePresence mode="wait">
            {phase === "creating" && (
              <motion.div
                key="creating"
                className="flex flex-col items-center gap-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <svg width="44" height="44" viewBox="0 0 44 44" className="animate-spin" style={{ animationDuration: "0.9s" }}>
                  <circle cx="22" cy="22" r="18" fill="none" stroke="var(--color-border-inner)" strokeWidth="2.5" />
                  <circle cx="22" cy="22" r="18" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="113" strokeDashoffset="80" />
                </svg>
                <p className="text-base font-medium text-[var(--color-text)]">Creando expediente…</p>
                <p className="text-sm text-[var(--color-muted)] max-w-xs text-center">Estamos generando el código y preparando el mensaje para el cliente.</p>
              </motion.div>
            )}
            {phase === "code" && (
              <motion.div
                key="code"
                className="flex flex-col items-center gap-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-accent-light)]">
                  <motion.span
                    className="h-2 w-2 rounded-full bg-[var(--color-accent)]"
                    animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                    transition={{ duration: 0.7, ease: EASE_INOUT as [number, number, number, number], repeat: Infinity }}
                  />
                </div>
                <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Código generado</p>
                <motion.p
                  className="font-mono text-xl font-semibold tabular-nums text-[var(--color-text)]"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: EASE_OUT as [number, number, number, number] }}
                >
                  {codigo}
                </motion.p>
              </motion.div>
            )}
            {phase === "success" && (
              <motion.div
                key="success"
                className="flex flex-col items-center gap-4 relative"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  className="absolute rounded-full"
                  style={{ backgroundColor: "#3D8B37" }}
                  initial={{ scale: 0.8, opacity: 0, filter: "blur(24px)" }}
                  animate={{ scale: 1.3, opacity: 0.25, filter: "blur(24px)" }}
                  transition={{ duration: 0.6 }}
                >
                  <div className="h-[80px] w-[80px]" />
                </motion.div>
                <motion.div
                  className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full"
                  style={{ backgroundColor: "#3D8B37" }}
                  initial={{ scale: 0.75, opacity: 0 }}
                  animate={{ scale: [0.75, 1.08, 1], opacity: 1 }}
                  transition={{ duration: 0.55, times: [0, 0.6, 1] }}
                >
                  <motion.svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <motion.path d="M5 12.5 L10 17 L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.3 }} />
                  </motion.svg>
                </motion.div>
                <motion.p className="text-lg font-semibold text-[var(--color-text)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>
                  Expediente creado
                </motion.p>
                <motion.p className="text-sm text-[var(--color-muted)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}>
                  <span className="font-mono text-[var(--color-text-secondary)]">{codigo}</span> creado correctamente
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Show skeleton until revealed */}
      {!revealed && phase === "done" && (
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
        </div>
      )}

      {revealed && expediente && (
        <>
          {/* Header */}
          <motion.header
            className="border-b border-[var(--color-border)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <div className="mx-auto flex max-w-6xl items-center px-6 sm:px-8 py-4">
              <div className="flex items-center gap-3 text-sm">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="text-[var(--color-tertiary)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
                  aria-label="Volver al Dashboard"
                >
                  <ArrowLeft size={18} strokeWidth={1.75} />
                </button>
                <Link
                  href="/dashboard"
                  className="text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  Dashboard
                </Link>
                <ChevronRight
                  size={14}
                  className="text-[var(--color-border)]"
                />
                <span className="text-[var(--color-muted)]">Nueva venta</span>
                <ChevronRight
                  size={14}
                  className="text-[var(--color-border)]"
                />
                <span className="font-medium text-[var(--color-text)]">
                  Instrucciones
                </span>
              </div>
            </div>
          </motion.header>

          {/* Content */}
          <main className="mx-auto max-w-6xl px-6 sm:px-8 py-10">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main column — 2/3 */}
              <div className="lg:col-span-2 flex flex-col gap-6">
                {/* Confirmation card */}
                <motion.div
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.45,
                    delay: 0.05,
                    ease: EASE_OUT as [number, number, number, number],
                  }}
                >
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="flex items-start gap-4">
                      <motion.div
                        className="flex h-10 w-10 items-center justify-center rounded-full shrink-0"
                        style={{
                          backgroundColor: "var(--color-success-bg)",
                        }}
                        initial={{ scale: 0.7 }}
                        animate={{ scale: [0.7, 1.08, 1] }}
                        transition={{ delay: 0.15, duration: 0.4 }}
                      >
                        <Check
                          size={18}
                          style={{ color: "var(--color-success)" }}
                          strokeWidth={2.5}
                        />
                      </motion.div>
                      <div>
                        <motion.h1
                          className="text-xl font-semibold text-[var(--color-text)]"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.35 }}
                        >
                          Expediente creado
                        </motion.h1>
                        <motion.p
                          className="text-sm text-[var(--color-muted)] mt-0.5"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.42 }}
                        >
                          Expediente{" "}
                          <span className="font-mono text-[var(--color-text-secondary)]">
                            {expediente.codigo}
                          </span>{" "}
                          creado correctamente
                        </motion.p>
                      </div>
                    </div>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5 }}
                    >
                      <StatusBadge estado={expediente.estado} />
                    </motion.div>
                  </div>

                  <motion.div
                    className="rounded-lg bg-[var(--color-bg-hover)] border border-[var(--color-border-inner)] p-5 grid grid-cols-2 gap-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.55 }}
                  >
                    <SummaryField label="Código" value={expediente.codigo} />
                    <SummaryField
                      label="Cliente"
                      value={expediente.clienteNombre}
                    />
                    <SummaryField
                      label="Fecha de creación"
                      value={new Date(
                        expediente.fechaCreacion,
                      ).toLocaleDateString("es-MX", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    />
                    <SummaryField
                      label="Tipo de operación"
                      value={
                        TIPO_OPERACION_LABELS[
                          (expediente as unknown as { tipoOperacion?: TipoOperacion })
                            .tipoOperacion ?? "ARMORING"
                        ] ?? "—"
                      }
                    />
                  </motion.div>
                </motion.div>

                {/* Message card */}
                <motion.div
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-7"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.45,
                    delay: 0.65,
                    ease: EASE_OUT as [number, number, number, number],
                  }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <MessageSquare
                      size={16}
                      className="text-[var(--color-muted)]"
                    />
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
                      Mensaje para el cliente
                    </h2>
                    <span className="text-[10px] text-[var(--color-tertiary)] ml-auto">
                      Listo para enviar por WhatsApp o correo
                    </span>
                  </div>

                  <div className="rounded-lg bg-[var(--color-bg-hover)] border border-[var(--color-border-inner)] p-5 text-[13px] leading-relaxed whitespace-pre-line text-[var(--color-text)] mb-4">
                    {mensaje}
                  </div>

                  <button
                    onClick={handleCopy}
                    className={`w-full flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium transition-all cursor-pointer ${
                      copied
                        ? "bg-[var(--color-success)] text-white"
                        : copyError
                          ? "bg-[var(--color-disabled-bg)] text-[var(--color-muted)]"
                          : "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]"
                    }`}
                  >
                    <AnimatePresence mode="wait">
                      {copied ? (
                        <motion.span
                          key="copied"
                          className="flex items-center gap-2"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <Check size={16} strokeWidth={2.5} />
                          Mensaje copiado
                        </motion.span>
                      ) : copyError ? (
                        <motion.span
                          key="error"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          No se pudo copiar
                        </motion.span>
                      ) : (
                        <motion.span
                          key="copy"
                          className="flex items-center gap-2"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <Copy size={16} strokeWidth={2} />
                          Copiar mensaje
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>

                  <p className="text-xs text-[var(--color-muted)] text-center mt-3">
                    Después de enviar este mensaje al cliente, podrás continuar
                    con la captura documental desde el expediente.
                  </p>
                </motion.div>

                {/* Secondary actions */}
                <motion.div
                  className="flex items-center gap-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.85, duration: 0.4 }}
                >
                  <button
                    onClick={() =>
                      router.push(`/expedientes/${expediente.id}`)
                    }
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-tertiary)] hover:text-[var(--color-text)] cursor-pointer"
                  >
                    Ir al expediente
                  </button>
                  <button
                    onClick={() => router.push("/dashboard")}
                    className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
                  >
                    Volver al dashboard
                  </button>
                </motion.div>
              </div>

              {/* Sidebar — 1/3 */}
              <motion.div
                className="lg:sticky lg:top-6 self-start"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: 0.3,
                  duration: 0.45,
                  ease: EASE_OUT as [number, number, number, number],
                }}
              >
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
                    Siguiente paso
                  </h3>
                  <p className="text-xs text-[var(--color-muted)] mb-5">
                    Ahora debes enviar el mensaje al cliente para que cargue sus
                    documentos y continuar el flujo.
                  </p>

                  <div className="flex flex-col">
                    {STEPS.map((step, i) => (
                      <RoadmapStep
                        key={step.label}
                        step={step}
                        index={i}
                        revealed={revealed}
                      />
                    ))}
                  </div>

                  <motion.div
                    className="border-t border-[var(--color-border-inner)] mt-4 pt-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.95 }}
                  >
                    <p className="text-[10px] uppercase tracking-wider text-[var(--color-tertiary)] mb-0.5">
                      Capturista
                    </p>
                    <p className="text-sm text-[var(--color-text)]">
                      {expediente.capturista ?? "—"}
                    </p>
                  </motion.div>
                </div>
              </motion.div>
            </div>
          </main>

          {/* Toast */}
          <AnimatePresence>
            {toast && (
              <motion.div
                className="fixed bottom-6 left-1/2 z-40 pointer-events-none -translate-x-1/2 flex items-center gap-2 rounded-lg bg-[var(--color-text)] px-4 py-2.5 text-sm text-white"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.25 }}
              >
                <Check
                  size={14}
                  strokeWidth={2.5}
                  style={{ color: "var(--color-accent)" }}
                />
                Mensaje copiado al portapapeles
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
