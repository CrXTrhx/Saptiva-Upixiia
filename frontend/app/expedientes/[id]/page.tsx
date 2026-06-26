"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ChevronRight, Check, X, Clock, AlertTriangle,
  FileText, Upload, MessageSquare, Mail, Phone, Pencil, Send,
  Archive, Ban, ArrowRight, Sparkles, Plus, RefreshCw, CornerUpLeft,
} from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import ValidarRechazarModal from "@/components/expediente/modals/ValidarRechazarModal";
import SubirDocumentoModal from "@/components/expediente/modals/SubirDocumentoModal";
import CancelarExpedienteModal from "@/components/expediente/modals/CancelarExpedienteModal";
import RespuestaLLMModal from "@/components/expediente/modals/RespuestaLLMModal";
import EditarDatosModal, { type EditarDatosValues } from "@/components/expediente/modals/EditarDatosModal";
import { Modal } from "@/components/ui/Modal";
import { expedientesService } from "@/services/expedientesService";
import { TIPO_OPERACION_LABELS } from "@/lib/reglas-negocio";
import {
  DOCUMENTO_REQUERIDO_LABELS,
  CANAL_LABELS,
  EVENT_TYPE_LABELS,
  MOTIVO_RECHAZO_LABELS,
  ESTADO_LABELS,
  ESTADO_DOCUMENTO_LABELS,
  PRIORIDAD_LABELS,
} from "@/lib/types";

// Las descripciones de los eventos las genera el backend (auditoría) y a veces
// embeben códigos en inglés (OFFICIAL_ID, WHATSAPP…). Las localizamos en display
// reemplazando cada código por su etiqueta en español, sin tocar el contrato.
const CODIGO_A_ETIQUETA: Record<string, string> = {
  ...DOCUMENTO_REQUERIDO_LABELS,
  ...CANAL_LABELS,
  ...ESTADO_LABELS,
  ...ESTADO_DOCUMENTO_LABELS,
  ...MOTIVO_RECHAZO_LABELS,
  ...PRIORIDAD_LABELS,
};
const CODIGO_RE = new RegExp(
  `\\b(${Object.keys(CODIGO_A_ETIQUETA).join("|")})\\b`,
  "g",
);
function localizarDescripcion(texto: string): string {
  return texto.replace(CODIGO_RE, (m) => CODIGO_A_ETIQUETA[m] ?? m);
}
import type {
  ConsultaLLM,
  Documento,
  DocumentoRequerido,
  Estado,
  EstadoDocumento,
  Evento,
  ExpedienteDetalle,
  MotivoRechazo,
  Nota,
  PrioridadNextStep,
  Canal,
  TipoOperacion,
  TonoEvento,
} from "@/lib/types";

// ═══════════════════════════════════════════
// DESIGN CONFIG (visual only — no logic)
// ═══════════════════════════════════════════

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

const estadoGlobalConfig: Record<Estado, { label: string; dot: string; bg: string; text: string }> = {
  CAPTURING:          { label: "Captura",    dot: "#8C9AAD", bg: "#EBEEF2", text: "#4F5A6B" },
  RECEIVING:          { label: "Recepción",  dot: "#B58A7A", bg: "#F1E8E3", text: "#6B4E40" },
  IN_VALIDATION:      { label: "Validación", dot: "#C9A85C", bg: "#F6EFDD", text: "#7A6435" },
  COMPLETE:           { label: "Completo",   dot: "#8FA585", bg: "#ECF0E8", text: "#536648" },
  INCOMPLETE_EXPIRED: { label: "Vencido",    dot: "#F19B42", bg: "#FCEEDB", text: "#A86518" },
  CANCELLED:          { label: "Cancelado",  dot: "#989396", bg: "#EAE7E6", text: "#5C5957" },
  ARCHIVED:           { label: "Archivado",  dot: "#B5AFA9", bg: "#EFECE9", text: "#7A7470" },
};

const docEstadoConfig: Record<string, { label: string; dot: string; bg: string; text: string; Icon: typeof Check }> = {
  PROCESSING:{ label: "Procesando",  dot: "#C99A5B", bg: "#FBEFD9", text: "#A86518", Icon: Sparkles },
  PENDING:   { label: "Pendiente",   dot: "#989396", bg: "#EAE7E6", text: "#5C5957", Icon: Clock },
  RECEIVED:  { label: "Recibido",    dot: "#8C9AAD", bg: "#EBEEF2", text: "#4F5A6B", Icon: FileText },
  VALIDATED: { label: "Validado",    dot: "#8FA585", bg: "#ECF0E8", text: "#536648", Icon: Check },
  REJECTED:  { label: "Rechazado",   dot: "#D88A6A", bg: "#F6E6DF", text: "#9C4B2E", Icon: X },
  EXPIRED:   { label: "Vencido",     dot: "#C9A85C", bg: "#F6EFDD", text: "#7A6435", Icon: AlertTriangle },
  REPLACED:  { label: "Reemplazado", dot: "#B5AFA9", bg: "#EFECE9", text: "#7A7470", Icon: RefreshCw },
};

const prioridadConfig: Record<PrioridadNextStep, { label: string; dot: string; bg: string; text: string }> = {
  HIGH:   { label: "Alta",  dot: "#F19B42", bg: "#FCEEDB", text: "#A86518" },
  MEDIUM: { label: "Media", dot: "#C9A85C", bg: "#F6EFDD", text: "#7A6435" },
  LOW:    { label: "Baja",  dot: "#8C9AAD", bg: "#EBEEF2", text: "#4F5A6B" },
};

const canalConfig: Record<Canal, { Icon: typeof Mail; color: string }> = {
  WHATSAPP:      { Icon: MessageSquare, color: "#536648" },
  EMAIL:         { Icon: Mail,          color: "#4F5A6B" },
  DIRECT_UPLOAD: { Icon: Upload,        color: "#A86518" },
};

const tonoColor: Record<TonoEvento, string> = {
  ok: "#8FA585", warn: "#D88A6A", accent: "#F19B42", neutral: "#B5AFA9",
};

// ═══════════════════════════════════════════
// INLINE SUB-COMPONENTS (visual primitives)
// ═══════════════════════════════════════════

function Badge({ cfg, small }: { cfg: { dot: string; bg: string; text: string; label: string }; small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-[11px]"}`}
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: cfg.dot }} />
      {cfg.label}
    </span>
  );
}

function Card({ children, className = "", delay = 0, hover = true, style }: {
  children: React.ReactNode; className?: string; delay?: number; hover?: boolean; style?: React.CSSProperties;
}) {
  return (
    <motion.div
      className={`rounded-xl bg-white ${className}`}
      style={{ border: "1px solid #E5DED6", ...style }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: EASE_OUT }}
      whileHover={hover ? { y: -1, transition: { duration: 0.2 } } : undefined}
    >
      {children}
    </motion.div>
  );
}

function SectionTitle({ icon: Icon, children, right }: { icon: typeof Check; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon size={13} strokeWidth={1.75} style={{ color: "#989396" }} />
        <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#5C5957" }}>{children}</h2>
      </div>
      {right}
    </div>
  );
}

function Dato({ icon: Icon, label, value, mono }: { icon?: typeof Phone; label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-0.5">
        {Icon && <Icon size={10} strokeWidth={1.75} style={{ color: "#B5AFA9" }} />}
        <span className="uppercase tracking-wider text-[10px]" style={{ color: "#B5AFA9" }}>{label}</span>
      </div>
      <span className={`text-[13px] ${mono ? "font-mono tabular-nums" : ""}`} style={{ color: "#302F2D" }}>{value || "—"}</span>
    </div>
  );
}

function ActionBtn({ icon: Icon, children, onClick, danger, disabled }: {
  icon: typeof Pencil; children: React.ReactNode; onClick?: () => void; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 text-[12px] font-medium px-3 py-2 rounded-md bg-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed w-full"
      style={{
        border: `1px solid ${danger ? "#D88A6A" : "#E5DED6"}`,
        color: danger ? "#9C4B2E" : "#5C5957",
      }}
      onMouseEnter={(e) => { (e.currentTarget.style.borderColor = danger ? "#D88A6A" : "#B5AFA9"); }}
      onMouseLeave={(e) => { (e.currentTarget.style.borderColor = danger ? "#D88A6A" : "#E5DED6"); }}
    >
      <Icon size={13} strokeWidth={1.75} />
      {children}
    </button>
  );
}

function FauxPdfPage({ tipo }: { tipo: string }) {
  return (
    <div className="w-full h-full flex flex-col p-3" style={{ backgroundColor: "#FDFCFA" }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#F19B42" }} />
        <div className="h-1 flex-1 rounded" style={{ backgroundColor: "#E5DED6" }} />
      </div>
      <div className="h-2 rounded mb-3" style={{ backgroundColor: "#302F2D", width: "60%" }} />
      {tipo === "OFFICIAL_ID" && (
        <div className="flex gap-2 mb-2">
          <div className="w-10 h-12 rounded" style={{ backgroundColor: "#EBEEF2" }} />
          <div className="flex-1 space-y-1.5">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-1 rounded" style={{ backgroundColor: i % 2 ? "#D8CFC9" : "#EDE7DF", width: `${70 + i * 5}%` }} />)}
          </div>
        </div>
      )}
      <div className="flex-1 space-y-1.5">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <div key={i} className="h-1 rounded" style={{ backgroundColor: i % 2 ? "#D8CFC9" : "#EDE7DF", width: `${60 + (i % 3) * 15}%` }} />)}
      </div>
      <div className="flex items-center justify-between mt-2 pt-1" style={{ borderTop: "1px solid #F0EBE5" }}>
        <FileText size={9} style={{ color: "#B5AFA9" }} />
        <span className="font-mono text-[9px] tabular-nums" style={{ color: "#B5AFA9" }}>1 / 1</span>
      </div>
    </div>
  );
}

function DocPreview({ doc, onOpen }: { doc: Documento; onOpen: (doc: Documento) => void }) {
  const ext = doc.filename.split(".").pop()?.toUpperCase() ?? "";
  const isPdf = doc.mimeType === "application/pdf" || doc.filename.endsWith(".pdf");
  const isImage = doc.mimeType.startsWith("image/");

  return (
    <button
      type="button"
      onClick={() => doc.archivoUrl && onOpen(doc)}
      disabled={!doc.archivoUrl}
      className="group relative rounded-md overflow-hidden shrink-0 w-40 h-52 cursor-zoom-in"
      style={{ border: "1px solid #E5DED6", backgroundColor: "#FFFFFF" }}
      aria-label={`Previsualizar documento ${doc.filename}`}
    >
      <span className="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider text-white" style={{ backgroundColor: "rgba(48,47,45,0.7)" }}>{ext}</span>
      {isImage && doc.archivoUrl ? (
        <img src={doc.archivoUrl} alt={doc.filename} className="w-full h-full object-cover" />
      ) : isPdf ? (
        <FauxPdfPage tipo={doc.tipo} />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2" style={{ backgroundColor: "#FAF6F1" }}>
          <FileText size={28} strokeWidth={1.5} style={{ color: "#B5AFA9" }} />
          <span className="font-mono text-[10px] px-2 text-center truncate w-full" style={{ color: "#989396" }}>{doc.filename}</span>
        </div>
      )}
      {!doc.archivoUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80">
          <span className="text-[11px] font-semibold" style={{ color: "#989396" }}>Sin archivo</span>
        </div>
      )}
    </button>
  );
}

function DocCard({ doc, onValidar, onRechazar, onReemplazar, onOpen, onVerVersionAnterior }: {
  doc: Documento; onValidar: (doc: Documento) => void; onRechazar: (doc: Documento) => void; onReemplazar: (doc: Documento) => void; onOpen: (doc: Documento) => void; onVerVersionAnterior: (doc: Documento) => void;
}) {
  const dcfg = docEstadoConfig[doc.estado] ?? docEstadoConfig.PENDING;
  const ccfg = canalConfig[doc.canal];
  const CanalIcon = ccfg?.Icon ?? Upload;

  if (doc.estado === "PROCESSING") {
    return (
      <div className="rounded-lg p-4 flex gap-4" style={{ backgroundColor: "#FAF6F1", border: "1px solid #F0EBE5" }}>
        <div className="w-16 h-20 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: "#F0EBE5" }}>
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}>
            <Sparkles size={18} strokeWidth={1.75} style={{ color: "#C99A5B" }} />
          </motion.div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[14px] font-semibold" style={{ color: "#302F2D" }}>{DOCUMENTO_REQUERIDO_LABELS[doc.tipo] ?? doc.tipo}</span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: "#FBEFD9", color: "#A86518" }}>Analizando…</span>
          </div>
          <p className="font-mono text-[11px] mb-2 truncate" style={{ color: "#989396" }}>{doc.filename}</p>
          <p className="text-[11px] mb-2" style={{ color: "#5C5957" }}>Procesando documento con Document AI…</p>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#F0EBE5" }}>
            <motion.div className="h-full rounded-full" style={{ width: "40%", backgroundColor: "#C99A5B" }} animate={{ x: ["-100%", "250%"] }} transition={{ repeat: Infinity, duration: 1.3, ease: "easeInOut" }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg p-4 flex gap-4 flex-wrap md:flex-nowrap" style={{ backgroundColor: "#FAF6F1", border: "1px solid #F0EBE5" }}>
      <DocPreview doc={doc} onOpen={onOpen} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-[14px] font-semibold" style={{ color: "#302F2D" }}>{DOCUMENTO_REQUERIDO_LABELS[doc.tipo] ?? doc.tipo}</span>
          <Badge cfg={dcfg} small />
          {ccfg && (
            <span className="ml-auto flex items-center gap-1 text-[10px]" style={{ color: "#989396" }}>
              <CanalIcon size={11} style={{ color: ccfg.color }} />
              {CANAL_LABELS[doc.canal] ?? doc.canal}
            </span>
          )}
        </div>
        <p className="font-mono text-[11px] mb-0.5" style={{ color: "#989396" }}>{doc.filename}</p>
        <p className="text-[10px] tabular-nums mb-2.5" style={{ color: "#B5AFA9" }}>
          {new Date(doc.fechaRecepcion).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · {doc.remitente}
        </p>
        {doc.datosExtraidos && Object.keys(doc.datosExtraidos).length > 0 && (
          <div className="rounded-md p-2.5 mb-2.5" style={{ backgroundColor: "#FFFFFF", border: "1px solid #F0EBE5" }}>
            <div className="flex items-center gap-1 mb-1.5">
              <Sparkles size={9} strokeWidth={1.75} style={{ color: "#B5AFA9" }} />
              <span className="text-[9px] uppercase tracking-wider" style={{ color: "#B5AFA9" }}>Datos extraídos</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {Object.entries(doc.datosExtraidos).map(([k, v]) => (
                <div key={k}>
                  <span className="text-[10px]" style={{ color: "#B5AFA9" }}>{k}: </span>
                  <span className="text-[10px] font-medium" style={{ color: "#5C5957" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {doc.versionAnterior && (
          <button
            type="button"
            onClick={() => onVerVersionAnterior(doc)}
            className="flex items-center gap-1 mb-2 text-[10px] cursor-pointer rounded px-1 -mx-1 py-0.5 transition-colors hover:underline"
            style={{ color: "#A86518" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#FCEEDB")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <CornerUpLeft size={10} />
            Ver versión anterior · {new Date(doc.versionAnterior.fechaRecepcion).toLocaleDateString("es-MX")}
          </button>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {doc.estado !== "VALIDATED" && (
            <button onClick={() => onValidar(doc)} className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-md cursor-pointer transition-colors" style={{ backgroundColor: "#ECF0E8", color: "#536648" }}>
              <Check size={11} strokeWidth={2.25} /> Validar
            </button>
          )}
          <button onClick={() => onRechazar(doc)} className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-md cursor-pointer transition-colors" style={{ backgroundColor: "#F6E6DF", color: "#9C4B2E" }}>
            <X size={11} /> Rechazar
          </button>
          <button onClick={() => onReemplazar(doc)} className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-md bg-white cursor-pointer transition-colors" style={{ border: "1px solid #E5DED6", color: "#5C5957" }}>
            <RefreshCw size={11} strokeWidth={1.75} /> Reemplazar
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// MODAL TYPE + PAGE WRAPPER (unchanged logic)
// ═══════════════════════════════════════════

type ModalState =
  | { type: "none" }
  | { type: "editar" }
  | { type: "validar-rechazar"; documento: Documento; mode: "validate" | "reject" }
  | { type: "subir"; modo: "nuevo" | "reemplazo"; documentoId?: string }
  | { type: "cancelar" }
  | { type: "llm-respuesta"; consulta: ConsultaLLM };

export default function ExpedienteDetallePage() {
  return (
    <ProtectedRoute>
      <DetalleContent />
    </ProtectedRoute>
  );
}

// ═══════════════════════════════════════════
// MAIN COMPONENT — ALL LOGIC PRESERVED EXACTLY
// ═══════════════════════════════════════════

function DetalleContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [detalle, setDetalle] = useState<ExpedienteDetalle | null>(null);
  const [dataStatus, setDataStatus] = useState<"loading" | "loaded" | "notFound" | "error">("loading");

  useEffect(() => {
    expedientesService
      .getExpedienteDetalle(id)
      .then((d) => {
        if (d) { setDetalle(d); setDataStatus("loaded"); }
        else setDataStatus("notFound");
      })
      .catch(() => setDataStatus("error"));
  }, [id]);

  // Mientras haya documentos en analisis (PROCESSING), refresca el detalle cada pocos
  // segundos para reflejar el resultado (datos extraidos, estado, historial). Como el
  // estado vive en el backend, esto sigue funcionando aunque se recargue la pagina.
  const hayProcesando = (detalle?.documentos ?? []).some((d) => d.estado === "PROCESSING");
  useEffect(() => {
    if (!hayProcesando) return;
    const t = setInterval(async () => {
      const fresh = await expedientesService.getExpedienteDetalle(id);
      if (fresh) setDetalle(fresh);
    }, 2500);
    return () => clearInterval(t);
  }, [hayProcesando, id]);

  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [modalLoading, setModalLoading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Documento | null>(null);
  // Documento vigente cuyo botón "Ver versión anterior" se abrió (muestra doc.versionAnterior).
  const [versionAnteriorDe, setVersionAnteriorDe] = useState<Documento | null>(null);
  const [restaurarLoading, setRestaurarLoading] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const handleOpenPreview = useCallback((doc: Documento) => setPreviewDoc(doc), []);
  const handleClosePreview = useCallback(() => setPreviewDoc(null), []);
  const handleVerVersionAnterior = useCallback((doc: Documento) => {
    if (doc.versionAnterior) setVersionAnteriorDe(doc);
  }, []);
  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const [detalleAbiertoTipo, setDetalleAbiertoTipo] = useState<DocumentoRequerido | null>(null);

  const [reenviarLoading, setReenviarLoading] = useState(false);
  const [llmLoading, setLlmLoading] = useState(false);
  const [notaLoading, setNotaLoading] = useState(false);
  const [nuevaNota, setNuevaNota] = useState("");
  const [historialOpen, setHistorialOpen] = useState(false);

  const checklist = detalle?.checklist ?? [];
  const documentos = detalle?.documentos ?? [];
  // Los next steps los calcula el backend (con prioridades HIGH/MEDIUM/LOW).
  const nextSteps = detalle?.nextSteps ?? [];
  const historial = detalle?.historial ?? [];
  const notas = detalle?.notas ?? [];
  const exp = detalle?.expediente;

  const activeDocumentos = useMemo(() => documentos.filter((d) => d.estado !== "REPLACED"), [documentos]);
  const checklistCompleto = useMemo(() => checklist.length === 4 && checklist.every((c) => c.estado === "VALIDATED"), [checklist]);
  const detalleDoc = useMemo(() => {
    if (!detalleAbiertoTipo) return null;
    return activeDocumentos.find((d) => d.tipo === detalleAbiertoTipo) ?? null;
  }, [detalleAbiertoTipo, activeDocumentos]);

  function handleSelectChecklistTipo(tipo: DocumentoRequerido) {
    const item = checklist.find((c) => c.tipo === tipo);
    if (!item?.documentoId) {
      showToast(`Aún no se recibe el documento ${DOCUMENTO_REQUERIDO_LABELS[tipo] ?? tipo}`);
      return;
    }
    setDetalleAbiertoTipo(detalleAbiertoTipo === tipo ? null : tipo);
  }

  async function handleValidarDoc(docId: string, datosExtraidos?: Record<string, string>) {
    if (!detalle) return;
    const prev = { ...detalle };
    const doc = detalle.documentos.find((d) => d.id === docId);
    const ev: Evento = { id: "ev-val-" + Date.now(), tipo: "DOCUMENT_VALIDATED", descripcion: `Documento ${doc ? DOCUMENTO_REQUERIDO_LABELS[doc.tipo] ?? doc.tipo : ""} validado`.trim(), timestamp: new Date().toISOString(), tono: "ok" };
    setDetalle({
      ...detalle,
      documentos: detalle.documentos.map((d) => d.id === docId ? { ...d, estado: "VALIDATED", ...(datosExtraidos ? { datosExtraidos } : {}) } : d),
      checklist: detalle.checklist.map((c) => c.documentoId === docId ? { ...c, estado: "VALIDATED" } : c),
      historial: [ev, ...detalle.historial],
    });
    try { await expedientesService.validarDocumento(docId); showToast("Documento validado"); } catch { setDetalle(prev); showToast("Error al validar documento"); }
  }

  async function handleRechazarDoc(docId: string, motivo: MotivoRechazo, datosExtraidos?: Record<string, string>) {
    if (!detalle) return;
    const prev = { ...detalle };
    const doc = detalle.documentos.find((d) => d.id === docId);
    const ev: Evento = { id: "ev-rech-" + Date.now(), tipo: "DOCUMENT_REJECTED", descripcion: `Documento ${doc ? DOCUMENTO_REQUERIDO_LABELS[doc.tipo] ?? doc.tipo : ""} rechazado. Motivo: ${MOTIVO_RECHAZO_LABELS[motivo.categoria] ?? motivo.categoria}`.trim(), timestamp: new Date().toISOString(), tono: "warn" };
    setDetalle({
      ...detalle,
      documentos: detalle.documentos.map((d) => d.id === docId ? { ...d, estado: "REJECTED", motivoRechazo: motivo, rechazoAutomatico: false, ...(datosExtraidos ? { datosExtraidos } : {}) } : d),
      checklist: detalle.checklist.map((c) => c.documentoId === docId ? { ...c, estado: "REJECTED" } : c),
      historial: [ev, ...detalle.historial],
    });
    setModal({ type: "none" });
    try { await expedientesService.rechazarDocumento(docId, motivo); showToast("Documento rechazado"); } catch { setDetalle(prev); showToast("Error al rechazar documento"); }
  }

  // Revertir un rechazo automático: vuelve a "recibido" sin llamar backend.
  function handleRevertirAuto(docId: string) {
    if (!detalle) return;
    const doc = detalle.documentos.find((d) => d.id === docId);
    const ev: Evento = { id: "ev-rev-" + Date.now(), tipo: "AUTO_REJECT_REVERTED", descripcion: `Rechazo automático revertido en ${doc ? DOCUMENTO_REQUERIDO_LABELS[doc.tipo] ?? doc.tipo : "documento"}`, timestamp: new Date().toISOString(), tono: "neutral" };
    setDetalle({
      ...detalle,
      documentos: detalle.documentos.map((d) => d.id === docId ? { ...d, estado: "RECEIVED", rechazoAutomatico: false, motivoRechazo: undefined } : d),
      checklist: detalle.checklist.map((c) => c.documentoId === docId ? { ...c, estado: "RECEIVED" } : c),
      historial: [ev, ...detalle.historial],
    });
    showToast("Rechazo automático revertido");
  }

  async function handleReemplazarDoc(docId: string, archivo: File) {
    if (!detalle) return;
    setModalLoading(true);
    const tipoDoc = detalle.documentos.find((d) => d.id === docId)?.tipo;
    try {
      const newDoc = await expedientesService.reemplazarDocumento(docId, archivo);
      const ev: Evento = { id: "ev-reemp-" + Date.now(), tipo: "DOCUMENT_REPLACED", descripcion: `Documento ${tipoDoc ? DOCUMENTO_REQUERIDO_LABELS[tipoDoc] ?? tipoDoc : ""} reemplazado. La versión anterior quedó en histórico`.trim(), timestamp: new Date().toISOString(), tono: "neutral" };
      setDetalle({ ...detalle, documentos: [...detalle.documentos.map((d) => d.id === docId ? { ...d, estado: "REPLACED" as const } : d), newDoc], checklist: detalle.checklist.map((c) => c.documentoId === docId ? { ...c, estado: "RECEIVED" as const, documentoId: newDoc.id } : c), historial: [ev, ...detalle.historial] });
      setModal({ type: "none" }); showToast("Documento reemplazado");
    } catch { showToast("Error al reemplazar documento"); } finally { setModalLoading(false); }
  }

  // Restaura la versión anterior: el doc vigente (docId) pasa a histórico y la
  // versión anterior vuelve a estar activa (RECEIVED, pendiente de validar).
  async function handleRestaurarVersion(docId: string) {
    if (!detalle) return;
    setRestaurarLoading(true);
    const tipoDoc = detalle.documentos.find((d) => d.id === docId)?.tipo;
    try {
      const restaurado = await expedientesService.restaurarVersion(docId);
      const ev: Evento = { id: "ev-rest-" + Date.now(), tipo: "DOCUMENT_REPLACED", descripcion: `Documento ${tipoDoc ? DOCUMENTO_REQUERIDO_LABELS[tipoDoc] ?? tipoDoc : ""} restaurado a la versión anterior`.trim(), timestamp: new Date().toISOString(), tono: "neutral" };
      setDetalle({
        ...detalle,
        documentos: [
          ...detalle.documentos.map((d) => d.id === docId ? { ...d, estado: "REPLACED" as const } : d),
          restaurado,
        ],
        checklist: detalle.checklist.map((c) => c.documentoId === docId ? { ...c, estado: "RECEIVED" as const, documentoId: restaurado.id } : c),
        historial: [ev, ...detalle.historial],
      });
      setVersionAnteriorDe(null);
      showToast("Versión anterior restaurada");
    } catch { showToast("Error al restaurar la versión anterior"); } finally { setRestaurarLoading(false); }
  }

  async function handleSubirManual(tipo: DocumentoRequerido, archivo: File) {
    if (!detalle) return;
    // Cierra la modal de inmediato. El backend guarda el documento en estado
    // PROCESSING y lo analiza en segundo plano; lo agregamos a la lista para que
    // aparezca la barra de "procesando". El polling (efecto abajo) lo actualizara
    // al terminar el analisis, y al recargar la pagina el estado persiste.
    setModal({ type: "none" });
    try {
      const newDoc = await expedientesService.subirDocumentoManual(id, tipo, archivo);
      setDetalle((prev) => prev ? {
        ...prev,
        documentos: [...prev.documentos, newDoc],
        checklist: prev.checklist.map((c) => c.tipo === tipo && c.estado === "PENDING" ? { ...c, estado: "RECEIVED" as const, documentoId: newDoc.id } : c),
      } : prev);
      showToast("Documento subido, analizando…");
    } catch {
      showToast("Error al subir documento");
    }
  }

  async function handleEditarDatos(datos: EditarDatosValues) {
    if (!detalle) return;
    setModalLoading(true);
    const prev = { ...detalle };
    const ev: Evento = { id: "ev-edit-" + Date.now(), tipo: "CASE_UPDATED", descripcion: "Datos del cliente actualizados", timestamp: new Date().toISOString(), tono: "neutral" };
    setDetalle({ ...detalle, expediente: { ...detalle.expediente, ...datos }, historial: [ev, ...detalle.historial] });
    try {
      await expedientesService.actualizarExpediente(id, datos);
      setModal({ type: "none" });
      showToast("Datos actualizados");
    } catch {
      setDetalle(prev);
      showToast("Error al actualizar datos");
    } finally {
      setModalLoading(false);
    }
  }

  async function handleReenviar() {
    setReenviarLoading(true);
    try { await expedientesService.reenviarInstrucciones(id); showToast("Instrucciones reenviadas"); } catch { showToast("Error al reenviar instrucciones"); } finally { setReenviarLoading(false); }
  }

  async function handleCancelar(motivo: string) {
    if (!detalle) return;
    const prev = { ...detalle };
    const ev: Evento = { id: "ev-canc-" + Date.now(), tipo: "CASE_CANCELLED", descripcion: `Expediente cancelado. Motivo: ${motivo}`, timestamp: new Date().toISOString(), tono: "warn" };
    setDetalle({ ...detalle, expediente: { ...detalle.expediente, estado: "CANCELLED" }, historial: [ev, ...detalle.historial] });
    setModal({ type: "none" });
    try { await expedientesService.cancelarExpediente(id, motivo); showToast("Expediente cancelado"); } catch { setDetalle(prev); showToast("Error al cancelar expediente"); }
  }

  async function handleMarcarCompleto() {
    if (!detalle) return;
    const prev = { ...detalle };
    setDetalle({ ...detalle, expediente: { ...detalle.expediente, estado: "COMPLETE" } });
    try { await expedientesService.marcarCompleto(id); showToast("Expediente marcado como completo"); } catch { setDetalle(prev); showToast("Error al marcar como completo"); }
  }

  async function handleArchivar() {
    if (!detalle) return;
    const prev = { ...detalle };
    setDetalle({ ...detalle, expediente: { ...detalle.expediente, estado: "ARCHIVED" } });
    try { await expedientesService.archivar(id); showToast("Expediente archivado"); } catch { setDetalle(prev); showToast("Error al archivar expediente"); }
  }

  async function handleAgregarNota(texto: string) {
    if (!detalle) return;
    const optimista: Nota = { id: "temp-" + Date.now(), texto, autor: "Administrador", timestamp: new Date().toISOString() };
    setDetalle({ ...detalle, notas: [optimista, ...detalle.notas] });
    setNotaLoading(true);
    try {
      const real = await expedientesService.agregarNota(id, texto);
      setDetalle((prev) => prev ? { ...prev, notas: prev.notas.map((n) => n.id === optimista.id ? real : n) } : prev);
      showToast("Nota agregada");
    } catch {
      setDetalle((prev) => prev ? { ...prev, notas: prev.notas.filter((n) => n.id !== optimista.id) } : prev);
      showToast("Error al agregar nota");
    } finally { setNotaLoading(false); }
  }

  async function handleConsultarLLM(pregunta: string) {
    setLlmLoading(true);
    try {
      const consulta = await expedientesService.consultarLLM(id, pregunta);
      setModal({ type: "llm-respuesta", consulta });
      if (detalle) {
        const ev: Evento = { id: "ev-llm-" + Date.now(), tipo: "LLM_QUERY", descripcion: `Consulta LLM: "${pregunta}" → ${consulta.respuesta === "si" ? "Sí" : "No"}`, timestamp: new Date().toISOString(), tono: "accent" };
        setDetalle({ ...detalle, historial: [ev, ...detalle.historial] });
      }
    } catch { showToast("Error en la consulta LLM"); } finally { setLlmLoading(false); }
  }

  // ═══════════════════════════════════════
  // RENDER — loading / error / notFound
  // ═══════════════════════════════════════

  if (dataStatus === "loading") {
    return <div className="flex min-h-screen items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: "#F19B42", borderTopColor: "transparent" }} /></div>;
  }
  if (dataStatus === "notFound") {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-4"><p className="text-base font-medium" style={{ color: "#302F2D" }}>Expediente no encontrado</p><button onClick={() => router.push("/dashboard")} className="text-sm cursor-pointer hover:underline" style={{ color: "#F19B42" }}>Volver al Dashboard</button></div>;
  }
  if (dataStatus === "error" || !exp) {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-4"><p className="text-base font-medium" style={{ color: "#302F2D" }}>Error al cargar el expediente</p><button onClick={() => window.location.reload()} className="text-sm cursor-pointer hover:underline" style={{ color: "#F19B42" }}>Reintentar</button></div>;
  }

  const validadosCount = checklist.filter((c) => c.estado === "VALIDATED").length;
  const estadoCfg = estadoGlobalConfig[exp.estado];

  // ═══════════════════════════════════════
  // RENDER — MAIN VIEW
  // ═══════════════════════════════════════

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F5F0EA", color: "#302F2D" }}>

      {/* 1. HEADER */}
      <header className="sticky top-0 z-30" style={{ backgroundColor: "#F5F0EA", borderBottom: "1px solid #E5DED6" }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            <button onClick={() => router.push("/dashboard")} className="transition-colors cursor-pointer" style={{ color: "#B5AFA9" }} onMouseEnter={e => e.currentTarget.style.color = "#302F2D"} onMouseLeave={e => e.currentTarget.style.color = "#B5AFA9"} aria-label="Volver">
              <ArrowLeft size={15} strokeWidth={1.75} />
            </button>
            <span className="flex items-center justify-center h-6 w-6 rounded-md text-[10px] font-bold text-white" style={{ backgroundColor: "#302F2D" }}>GE</span>
            <Link href="/dashboard" className="transition-colors hover:underline" style={{ color: "#989396" }}>Dashboard</Link>
            <ChevronRight size={11} style={{ color: "#D8CFC9" }} />
            <span className="font-mono tabular-nums font-medium" style={{ color: "#302F2D" }}>{exp.codigo}</span>
          </div>
          <div className="flex items-center gap-3">
            <Badge cfg={estadoCfg} />
            <button
              onClick={() => setHistorialOpen((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-md cursor-pointer transition-colors"
              style={{
                border: "1px solid #E5DED6",
                backgroundColor: historialOpen ? "#302F2D" : "transparent",
                color: historialOpen ? "#FFFFFF" : "#989396",
              }}
            >
              <Clock size={12} strokeWidth={1.75} />
              Historial
              {historial.length > 0 && (
                <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center" style={{ backgroundColor: historialOpen ? "rgba(255,255,255,0.2)" : "#F0EBE5", color: historialOpen ? "#FFFFFF" : "#5C5957" }}>
                  {historial.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* 2. BLOQUE A — FICHA */}
        <Card className="p-6" hover={false} delay={0.02}>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex-1 min-w-[280px]">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-2xl font-semibold tracking-tight font-mono tabular-nums" style={{ color: "#302F2D" }}>{exp.codigo}</h1>
                <Badge cfg={estadoCfg} />
              </div>
              <p className="text-base font-medium mb-4" style={{ color: "#302F2D" }}>{exp.clienteNombre}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-3">
                <Dato icon={Phone} label="Teléfono" value={exp.clienteTelefono} />
                <Dato icon={Mail} label="Correo" value={exp.clienteCorreo} />
                <Dato label="RFC" value={exp.clienteRfc ?? "—"} mono />
                <Dato label="Monto" value={`$${exp.montoEstimado.toLocaleString("es-MX")}`} mono />
                <Dato label="Tipo de operación" value={TIPO_OPERACION_LABELS[exp.tipoOperacion] ?? exp.tipoOperacion} />
                <Dato label="Fecha creación" value={new Date(exp.fechaCreacion).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })} />
                <Dato label="Capturista" value={exp.capturista} />
              </div>
            </div>
            <div className="flex flex-col gap-2 items-stretch min-w-[180px]">
              <ActionBtn icon={Pencil} onClick={() => setModal({ type: "editar" })}>Editar datos</ActionBtn>
              <ActionBtn icon={Send} onClick={handleReenviar} disabled={reenviarLoading}>{reenviarLoading ? "Enviando..." : "Reenviar instrucciones"}</ActionBtn>
              {exp.estado !== "CANCELLED" && exp.estado !== "ARCHIVED" && (
                <ActionBtn icon={Ban} danger onClick={() => setModal({ type: "cancelar" })}>Cancelar expediente</ActionBtn>
              )}
              {exp.estado === "COMPLETE" && <ActionBtn icon={Archive} onClick={handleArchivar}>Archivar</ActionBtn>}
            </div>
          </div>
        </Card>

        {/* 3. FILA DE CONTROL */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* 3a. CHECKLIST */}
          <Card className="p-6" delay={0.06}>
            <SectionTitle icon={Check}>Checklist de documentos</SectionTitle>
            <div className="space-y-2.5">
              {checklist.map((item) => {
                const cfg = docEstadoConfig[item.estado] ?? docEstadoConfig.PENDING;
                const CfgIcon = cfg.Icon;
                const isActive = detalleAbiertoTipo === item.tipo;
                const hasDoc = !!item.documentoId;
                return (
                  <button
                    key={item.tipo}
                    onClick={() => handleSelectChecklistTipo(item.tipo)}
                    className="w-full flex items-center justify-between py-2 px-3 rounded-lg text-left transition-all cursor-pointer"
                    style={{
                      backgroundColor: isActive ? "#FFFFFF" : "#FAF6F1",
                      border: `1px solid ${isActive ? "#F19B42" : "#F0EBE5"}`,
                      boxShadow: isActive ? "0 0 0 3px rgba(241,155,66,0.08)" : "none",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-6 h-6 rounded-md" style={{ backgroundColor: cfg.bg }}>
                        <CfgIcon size={12} strokeWidth={2} style={{ color: cfg.text }} />
                      </div>
                      <span className="text-[13px] font-medium" style={{ color: "#302F2D" }}>{DOCUMENTO_REQUERIDO_LABELS[item.tipo] ?? item.tipo}</span>
                      {!hasDoc && <span className="text-[10px]" style={{ color: "#B5AFA9" }}>(no recibido)</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge cfg={cfg} small />
                      {hasDoc && (
                        <ChevronRight
                          size={13} strokeWidth={1.75}
                          style={{ color: isActive ? "#F19B42" : "#B5AFA9", transform: isActive ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] mt-3" style={{ color: "#B5AFA9" }}>Haz clic en un documento para ver su detalle abajo.</p>
          </Card>

          {/* 3b. NEXT STEPS */}
          <Card className="p-6" delay={0.10}>
            <SectionTitle icon={ArrowRight}>Next steps</SectionTitle>
            {nextSteps.length === 0 ? (
              <p className="text-[12px] text-center py-4" style={{ color: "#989396" }}>Sin pendientes</p>
            ) : (
              <div className="space-y-2.5">
                {nextSteps.map((step, i) => {
                  const pcfg = prioridadConfig[step.prioridad];
                  return (
                    <motion.div
                      key={step.id}
                      initial={{ opacity: 0, x: 6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.35, delay: 0.15 + i * 0.06, ease: EASE_OUT }}
                      className="flex items-center gap-3 py-2.5 px-3 rounded-lg"
                      style={{ backgroundColor: "#FAF6F1", border: "1px solid #F0EBE5" }}
                    >
                      <span className="h-[7px] w-[7px] rounded-full shrink-0" style={{ backgroundColor: pcfg.dot }} />
                      <span className="text-[13px] flex-1" style={{ color: "#302F2D" }}>{step.texto}</span>
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: pcfg.bg, color: pcfg.text }}>{pcfg.label}</span>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* 4. DETALLE DOCUMENTO SELECCIONADO */}
        <AnimatePresence mode="wait">
          {detalleDoc && (
            <motion.div
              key={detalleDoc.id}
              initial={{ opacity: 0, y: 8, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.99 }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
            >
              <Card className="p-6" hover={false}>
                <SectionTitle
                  icon={FileText}
                  right={
                    <button onClick={() => setDetalleAbiertoTipo(null)} className="w-7 h-7 flex items-center justify-center rounded-md cursor-pointer transition-colors" style={{ color: "#989396" }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#FAF6F1"; e.currentTarget.style.color = "#302F2D"; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#989396"; }}>
                      <X size={14} />
                    </button>
                  }
                >
                  Detalle: {DOCUMENTO_REQUERIDO_LABELS[detalleDoc.tipo] ?? detalleDoc.tipo}
                </SectionTitle>
                <DocCard doc={detalleDoc} onValidar={(d) => setModal({ type: "validar-rechazar", documento: d, mode: "validate" })} onRechazar={(d) => setModal({ type: "validar-rechazar", documento: d, mode: "reject" })} onReemplazar={(d) => setModal({ type: "subir", modo: "reemplazo", documentoId: d.id })} onOpen={handleOpenPreview} onVerVersionAnterior={handleVerVersionAnterior} />
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 5. GRID PRINCIPAL */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* 5a. MAIN */}
          <div className="lg:col-span-7 space-y-5">

            {/* BLOQUE D — DOCUMENTOS */}
            <Card className="p-6" hover={false} delay={0.14}>
              <SectionTitle
                icon={FileText}
                right={
                  <button onClick={() => setModal({ type: "subir", modo: "nuevo" })} className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-md bg-white cursor-pointer transition-colors" style={{ border: "1px solid #E5DED6", color: "#5C5957" }}>
                    <Plus size={12} strokeWidth={2} /> Subir documento manual
                  </button>
                }
              >
                Documentos recibidos
              </SectionTitle>
              {activeDocumentos.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-[12px] mb-3" style={{ color: "#989396" }}>Aún no hay documentos recibidos</p>
                  <button onClick={() => setModal({ type: "subir", modo: "nuevo" })} className="text-[12px] font-medium px-3 py-1.5 rounded-md cursor-pointer" style={{ backgroundColor: "#FAF6F1", color: "#5C5957", border: "1px solid #F0EBE5" }}>
                    <Plus size={12} strokeWidth={2} className="inline mr-1" />Subir documento manual
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeDocumentos.map((doc) => (
                    <DocCard key={doc.id} doc={doc} onValidar={(d) => setModal({ type: "validar-rechazar", documento: d, mode: "validate" })} onRechazar={(d) => setModal({ type: "validar-rechazar", documento: d, mode: "reject" })} onReemplazar={(d) => setModal({ type: "subir", modo: "reemplazo", documentoId: d.id })} onOpen={handleOpenPreview} onVerVersionAnterior={handleVerVersionAnterior} />
                  ))}
                </div>
              )}
            </Card>

          </div>

          {/* 5b. SIDEBAR */}
          <div className="lg:col-span-5 space-y-5">

            {/* BLOQUE G — ASISTENTE */}
            <Card className="p-6" delay={0.16}>
              <SectionTitle icon={Sparkles}>Asistente normativo</SectionTitle>
              <div className="space-y-2">
                {["¿Hay que avisar al SAT?", "¿Se puede pagar en efectivo?"].map((q) => (
                  <button
                    key={q}
                    onClick={() => handleConsultarLLM(q)}
                    disabled={llmLoading}
                    className="w-full flex items-center justify-between gap-2 text-[13px] px-3.5 py-2.5 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                    style={{ backgroundColor: "#FAF6F1", border: "1px solid #E5DED6", color: "#5C5957" }}
                    onMouseEnter={e => { if (!llmLoading) { e.currentTarget.style.borderColor = "#F19B42"; e.currentTarget.style.color = "#302F2D"; } }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5DED6"; e.currentTarget.style.color = "#5C5957"; }}
                  >
                    {q}
                    <ChevronRight size={13} style={{ color: "#B5AFA9" }} />
                  </button>
                ))}
              </div>
            </Card>

            {/* BLOQUE F — NOTAS */}
            <Card className="p-6" hover={false} delay={0.20}>
              <SectionTitle icon={MessageSquare}>Notas internas</SectionTitle>
              <div className="mb-4">
                <textarea
                  rows={2}
                  placeholder="Escribe una nota interna…"
                  value={nuevaNota}
                  onChange={(e) => setNuevaNota(e.target.value)}
                  className="w-full text-[13px] px-3 py-2 rounded-md resize-none bg-white transition-colors"
                  style={{ border: "1px solid #E5DED6", color: "#302F2D", outline: "none" }}
                  onFocus={(e) => e.currentTarget.style.borderColor = "#F19B42"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "#E5DED6"}
                />
                <button
                  onClick={() => { if (nuevaNota.trim()) { handleAgregarNota(nuevaNota.trim()); setNuevaNota(""); } }}
                  disabled={!nuevaNota.trim() || notaLoading}
                  className="mt-2 flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-md cursor-pointer transition-colors disabled:cursor-not-allowed"
                  style={{ backgroundColor: nuevaNota.trim() && !notaLoading ? "#302F2D" : "#EFECE9", color: nuevaNota.trim() && !notaLoading ? "#FFFFFF" : "#B5AFA9" }}
                >
                  <Plus size={12} strokeWidth={2} /> Agregar nota
                </button>
              </div>
              {notas.length === 0 ? (
                <p className="text-[11px]" style={{ color: "#989396" }}>Sin notas aún</p>
              ) : (
                <AnimatePresence initial={false}>
                  {notas.map((nota, i) => (
                    <motion.div
                      key={nota.id}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: EASE_OUT }}
                      className="pb-3 mb-3"
                      style={{ borderBottom: i < notas.length - 1 ? "1px solid #F0EBE5" : "none" }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[12px] font-medium" style={{ color: "#302F2D" }}>{nota.autor}</span>
                        <span className="text-[10px] tabular-nums" style={{ color: "#B5AFA9" }}>
                          {new Date(nota.timestamp).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-[12px] leading-relaxed" style={{ color: "#5C5957" }}>{nota.texto}</p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </Card>

          </div>
        </div>

        {/* 6. BLOQUE H — VALIDACIÓN FINAL */}
        <Card className="p-6" hover={false} delay={0.24}>
          <SectionTitle icon={Check}>Validación final</SectionTitle>
          {exp.estado === "COMPLETE" ? (
            <div className="rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap" style={{ backgroundColor: "#ECF0E8" }}>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-9 w-9 rounded-full" style={{ backgroundColor: "#536648" }}>
                  <Check size={16} strokeWidth={2.5} color="white" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold" style={{ color: "#536648" }}>Expediente completo</p>
                  <p className="text-[11px]" style={{ color: "#7A8C70" }}>Todos los documentos validados</p>
                </div>
              </div>
              <button onClick={handleArchivar} className="flex items-center gap-2 text-[12px] font-medium px-4 py-2 rounded-md bg-white cursor-pointer transition-colors" style={{ border: "1px solid #E5DED6", color: "#302F2D" }}>
                <Archive size={13} strokeWidth={1.75} /> Archivar expediente
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-6 flex-wrap">
              <div className="flex-1 min-w-[260px]">
                <p className="text-[13px] mb-2" style={{ color: "#302F2D" }}>Para marcar el expediente como validado, todos los documentos deben estar validados.</p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium tabular-nums" style={{ color: "#5C5957" }}>{validadosCount}/4 documentos validados</span>
                  <div className="flex-1 max-w-[200px] h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#F0EBE5" }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: validadosCount === 4 ? "#536648" : "#F19B42" }}
                      animate={{ width: `${(validadosCount / 4) * 100}%` }}
                      transition={{ duration: 0.5, ease: EASE_OUT }}
                    />
                  </div>
                </div>
              </div>
              <motion.button
                onClick={handleMarcarCompleto}
                disabled={!checklistCompleto}
                className="flex items-center gap-2 text-sm font-medium px-6 py-3 rounded-md cursor-pointer disabled:cursor-not-allowed transition-colors"
                style={{ backgroundColor: checklistCompleto ? "#F19B42" : "#EFECE9", color: checklistCompleto ? "#FFFFFF" : "#B5AFA9" }}
                whileHover={checklistCompleto ? { scale: 1.01 } : undefined}
                whileTap={checklistCompleto ? { scale: 0.98 } : undefined}
              >
                <Check size={15} strokeWidth={2.25} /> Marcar como validado
              </motion.button>
            </div>
          )}
        </Card>

        <div className="h-2" />
      </main>

      {/* HISTORIAL SLIDING PANEL */}
      <AnimatePresence>
        {historialOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40"
              style={{ backgroundColor: "rgba(48,47,45,0.15)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setHistorialOpen(false)}
            />
            <motion.aside
              className="fixed top-0 right-0 z-50 h-full w-[360px] max-w-[85vw] flex flex-col bg-white"
              style={{ borderLeft: "1px solid #E5DED6" }}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
            >
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #F0EBE5" }}>
                <div className="flex items-center gap-2">
                  <Clock size={14} strokeWidth={1.75} style={{ color: "#989396" }} />
                  <h2 className="text-sm font-semibold" style={{ color: "#302F2D" }}>Historial de eventos</h2>
                  {historial.length > 0 && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#F0EBE5", color: "#5C5957" }}>{historial.length}</span>
                  )}
                </div>
                <button onClick={() => setHistorialOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-md cursor-pointer transition-colors" style={{ color: "#989396" }} onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#FAF6F1"; e.currentTarget.style.color = "#302F2D"; }} onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#989396"; }}>
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {historial.length === 0 ? (
                  <p className="text-[12px] text-center py-8" style={{ color: "#989396" }}>Sin eventos aún</p>
                ) : (
                  <div>
                    {historial.map((ev, i) => (
                      <motion.div
                        key={ev.id}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: 0.05 + i * 0.03, ease: EASE_OUT }}
                        className={`flex gap-3 ${i < historial.length - 1 ? "pb-4" : ""}`}
                      >
                        <div className="flex flex-col items-center">
                          <span className="h-2 w-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: tonoColor[ev.tono] }} />
                          {i < historial.length - 1 && <span className="w-px flex-1 mt-1" style={{ backgroundColor: "#E5DED6" }} />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-medium" style={{ color: "#302F2D" }}>{EVENT_TYPE_LABELS[ev.tipo] ?? ev.tipo}</span>
                            <span className="text-[10px] tabular-nums" style={{ color: "#B5AFA9" }}>
                              {new Date(ev.timestamp).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit" })} {new Date(ev.timestamp).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="text-[11px] leading-relaxed" style={{ color: "#5C5957" }}>{localizarDescripcion(ev.descripcion)}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* MODALS */}
      {previewDoc && (
        <Modal open={!!previewDoc} onClose={handleClosePreview} title={`Previsualizar ${previewDoc.filename}`} maxWidth="max-w-4xl">
          <div className="space-y-4">
            <div className="text-sm text-[var(--color-text)]" style={{ color: "#5C5957" }}>
              {DOCUMENTO_REQUERIDO_LABELS[previewDoc.tipo] ?? previewDoc.tipo} • {CANAL_LABELS[previewDoc.canal] ?? previewDoc.canal} • {new Date(previewDoc.fechaRecepcion).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
            </div>
            {previewDoc.archivoUrl ? (
              previewDoc.mimeType.startsWith("image/") ? (
                <img src={previewDoc.archivoUrl} alt={previewDoc.filename} className="w-full rounded-xl object-contain" style={{ maxHeight: "70vh" }} />
              ) : previewDoc.mimeType === "application/pdf" ? (
                <iframe src={previewDoc.archivoUrl} title={previewDoc.filename} className="w-full h-[70vh] rounded-xl border border-[#E5DED6]" />
              ) : (
                <div className="w-full h-[70vh] flex items-center justify-center rounded-xl" style={{ backgroundColor: "#FAF6F1" }}>
                  <span className="text-sm" style={{ color: "#989396" }}>Tipo de archivo no compatible para previsualizar.</span>
                </div>
              )
            ) : (
              <div className="w-full h-[70vh] flex items-center justify-center rounded-xl" style={{ backgroundColor: "#FAF6F1" }}>
                <span className="text-sm" style={{ color: "#989396" }}>No hay archivo disponible para este documento.</span>
              </div>
            )}
          </div>
        </Modal>
      )}
      {versionAnteriorDe?.versionAnterior && (() => {
        const prev = versionAnteriorDe.versionAnterior;
        if (!prev) return null;
        const dcfg = docEstadoConfig[prev.estado] ?? docEstadoConfig.PENDING;
        return (
          <Modal
            open={!!versionAnteriorDe}
            onClose={() => { if (!restaurarLoading) setVersionAnteriorDe(null); }}
            title={`Versión anterior · ${DOCUMENTO_REQUERIDO_LABELS[prev.tipo] ?? prev.tipo}`}
            maxWidth="max-w-4xl"
          >
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg p-3" style={{ backgroundColor: "#FCEEDB", border: "1px solid #F0D9B8" }}>
                <CornerUpLeft size={15} strokeWidth={2} style={{ color: "#A86518" }} className="mt-0.5 shrink-0" />
                <p className="text-[12px]" style={{ color: "#8A6730" }}>
                  Esta es la versión que se reemplazó. Puedes quedarte con ella (volverá a quedar activa, pendiente de validar) o conservar la versión más nueva.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]" style={{ color: "#5C5957" }}>
                <Badge cfg={dcfg} small />
                <span style={{ color: "#D8CFC9" }}>·</span>
                <span className="font-mono text-[11px]">{prev.filename}</span>
                <span style={{ color: "#D8CFC9" }}>·</span>
                <span>{CANAL_LABELS[prev.canal] ?? prev.canal}</span>
                <span style={{ color: "#D8CFC9" }}>·</span>
                <span className="tabular-nums">{new Date(prev.fechaRecepcion).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </div>

              {prev.motivoRechazo && (
                <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "#9C4B2E" }}>
                  <AlertTriangle size={12} />
                  Motivo de rechazo previo: {MOTIVO_RECHAZO_LABELS[prev.motivoRechazo.categoria] ?? prev.motivoRechazo.categoria}
                  {prev.motivoRechazo.texto ? ` — ${prev.motivoRechazo.texto}` : ""}
                </div>
              )}

              {prev.archivoUrl ? (
                prev.mimeType.startsWith("image/") ? (
                  <img src={prev.archivoUrl} alt={prev.filename} className="w-full rounded-xl object-contain" style={{ maxHeight: "60vh" }} />
                ) : prev.mimeType === "application/pdf" ? (
                  <iframe src={prev.archivoUrl} title={prev.filename} className="w-full h-[60vh] rounded-xl border border-[#E5DED6]" />
                ) : (
                  <div className="w-full h-[40vh] flex items-center justify-center rounded-xl" style={{ backgroundColor: "#FAF6F1" }}>
                    <span className="text-sm" style={{ color: "#989396" }}>Tipo de archivo no compatible para previsualizar.</span>
                  </div>
                )
              ) : (
                <div className="w-full h-[40vh] flex items-center justify-center rounded-xl" style={{ backgroundColor: "#FAF6F1" }}>
                  <span className="text-sm" style={{ color: "#989396" }}>No hay archivo disponible para esta versión.</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setVersionAnteriorDe(null)}
                  disabled={restaurarLoading}
                  className="rounded-md bg-white px-4 py-2 text-[12px] font-medium transition-colors disabled:opacity-50"
                  style={{ border: "1px solid #E5DED6", color: "#5C5957" }}
                >
                  Volver a la más nueva
                </button>
                <button
                  type="button"
                  onClick={() => handleRestaurarVersion(versionAnteriorDe.id)}
                  disabled={restaurarLoading}
                  className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[12px] font-medium text-white transition-colors disabled:cursor-not-allowed"
                  style={{ backgroundColor: restaurarLoading ? "#E7C9A0" : "#F19B42" }}
                >
                  <CornerUpLeft size={13} strokeWidth={2} />
                  {restaurarLoading ? "Restaurando…" : "Quedarme con esta versión"}
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}
      {modal.type === "editar" && (
        <EditarDatosModal
          expediente={{ codigo: exp.codigo, clienteNombre: exp.clienteNombre, clienteTelefono: exp.clienteTelefono, clienteCorreo: exp.clienteCorreo, clienteRfc: exp.clienteRfc, montoEstimado: exp.montoEstimado, tipoOperacion: exp.tipoOperacion }}
          onConfirm={handleEditarDatos}
          onClose={() => setModal({ type: "none" })}
          loading={modalLoading}
        />
      )}
      {modal.type === "validar-rechazar" && (
        <ValidarRechazarModal
          documento={documentos.find((d) => d.id === modal.documento.id) ?? modal.documento}
          expediente={{ codigo: exp.codigo, clienteNombre: exp.clienteNombre }}
          mode={modal.mode}
          onValidar={(datos) => { handleValidarDoc(modal.documento.id, datos); setModal({ type: "none" }); }}
          onRechazar={(motivo, datos) => handleRechazarDoc(modal.documento.id, motivo, datos)}
          onRevertir={() => handleRevertirAuto(modal.documento.id)}
          onClose={() => setModal({ type: "none" })}
          loading={modalLoading}
        />
      )}
      {modal.type === "subir" && (
        <SubirDocumentoModal
          modo={modal.modo}
          expediente={{ codigo: exp.codigo, clienteNombre: exp.clienteNombre }}
          documentoActual={modal.documentoId ? documentos.find((d) => d.id === modal.documentoId) ?? null : null}
          onConfirm={(tipo, archivo) => { if (modal.modo === "reemplazo" && modal.documentoId) { handleReemplazarDoc(modal.documentoId, archivo); } else { handleSubirManual(tipo, archivo); } }}
          onClose={() => setModal({ type: "none" })}
          loading={modalLoading}
        />
      )}
      {modal.type === "cancelar" && (
        <CancelarExpedienteModal
          expediente={{ codigo: exp.codigo, clienteNombre: exp.clienteNombre, estado: exp.estado, fechaCreacion: exp.fechaCreacion, capturista: exp.capturista }}
          onConfirm={handleCancelar}
          onClose={() => setModal({ type: "none" })}
          loading={modalLoading}
        />
      )}
      {modal.type === "llm-respuesta" && (
        <RespuestaLLMModal consulta={modal.consulta} expediente={{ codigo: exp.codigo, clienteNombre: exp.clienteNombre }} onClose={() => setModal({ type: "none" })} />
      )}

      {/* TOAST */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs text-white pointer-events-none"
            style={{ backgroundColor: "#302F2D", boxShadow: "0 4px 12px rgba(48,47,45,0.15)" }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.25 }}
          >
            <Check size={13} strokeWidth={2.25} style={{ color: "#F19B42" }} />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
