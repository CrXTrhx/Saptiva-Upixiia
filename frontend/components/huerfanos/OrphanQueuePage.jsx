"use client";

// =============================================================================
// P6 — Cola de Huérfanos
// -----------------------------------------------------------------------------
// Documentos recibidos por WhatsApp / Correo / Carga manual que aún no se asocian
// a un expediente. Permite: asignar a expediente (P7), crear expediente prellenado
// (P3) o descartar.
//
// Conectado al backend: GET /huerfanos, POST /huerfanos/:id/asignar y /descartar.
// Los códigos llegan en inglés (PENDING, WHATSAPP, OFFICIAL_ID…) y se muestran en
// español vía los mapas de etiquetas de cada config.
// =============================================================================

import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AssignOrphanModal from "./AssignOrphanModal";
import { huerfanosService } from "@/services/huerfanosService";
import { expedientesService } from "@/services/expedientesService";
import {
  Search,
  FileText,
  Mail,
  MessageCircle,
  Upload,
  Link2,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
  ChevronDown,
  ArrowLeft,
  ChevronRight,
  Image as ImageIcon,
  Sparkles,
  Calendar,
  HelpCircle,
  ZoomIn,
} from "lucide-react";

const BG = "#F1EBE0";
const ACCENT = "#F19B42";
const EASE_OUT = [0.16, 1, 0.3, 1];

// --- Config (claves = códigos del backend en inglés; label = español) ----------

const estadoConfig = {
  PENDING: { label: "Pendiente", dot: "#F59E0B", bg: "#FEF3C7", text: "#92400E", icon: Clock },
  ASSIGNED: { label: "Asignado", dot: "#10B981", bg: "#D1FAE5", text: "#047857", icon: CheckCircle2 },
  DISCARDED: { label: "Descartado", dot: "#9CA3AF", bg: "#F3F4F6", text: "#6B7280", icon: X },
};

const canalConfig = {
  WHATSAPP: { label: "WhatsApp", icon: MessageCircle, color: "#10B981", bg: "#D1FAE5" },
  EMAIL: { label: "Correo", icon: Mail, color: "#3B82F6", bg: "#DBEAFE" },
  DIRECT_UPLOAD: { label: "Carga manual", icon: Upload, color: "#F19B42", bg: "#FCEEDB" },
};

const tipoDetectadoConfig = {
  OFFICIAL_ID: { label: "INE", color: "#8B5CF6", bg: "#EDE9FE", text: "#6D28D9" },
  CURP: { label: "CURP", color: "#3B82F6", bg: "#DBEAFE", text: "#1E40AF" },
  TAX_STATUS_CERT: { label: "CSF", color: "#F59E0B", bg: "#FEF3C7", text: "#92400E" },
  PROOF_OF_ADDRESS: { label: "Comprobante de Domicilio", color: "#10B981", bg: "#D1FAE5", text: "#047857" },
  UNKNOWN: { label: "Desconocido", color: "#9CA3AF", bg: "#F3F4F6", text: "#6B7280" },
};

// --- Adaptadores backend → shape interno de la pantalla -----------------------

function adaptarHuerfano(o) {
  return {
    id: o.id,
    archivo: o.filename || "documento",
    archivoUrl: o.archivoUrl || null,
    mimeType: o.mimeType || "",
    tipoDetectado: o.tipoSugerido || "UNKNOWN",
    canal: o.canal,
    remitente: o.remitente || "",
    timestamp: o.fechaRecepcion,
    mensajeOriginal: o.textoMensaje || "",
    estado: o.estado,
    datosExtraidos: o.datosExtraidos || null,
    expedienteSugerido: o.expedienteSugerido || null,
  };
}

function adaptarExpedienteAsignable(e) {
  return {
    id: e.id,
    codigo: e.codigo,
    cliente: e.clienteNombre,
    rfc: e.clienteRfc || "",
    telefono: e.clienteTelefono || "",
    correo: e.clienteCorreo || "",
    estado: e.estado,
    tipoOperacion: e.tipoOperacion,
    fechaCreacion: e.fechaCreacion
      ? new Date(e.fechaCreacion).toLocaleDateString("es-MX")
      : "",
  };
}
const documentosHuerfanosIniciales = [
  {
    id: "HUE-001",
    archivo: "ine_sofia_frente.jpg",
    archivoUrl: "https://placehold.co/400x600/F5F0EA/111827?text=INE+Sof%C3%ADa",
    mimeType: "image/jpeg",
    tipoDetectado: "INE",
    canal: "WhatsApp",
    remitente: "+52 55 1234 5678",
    timestamp: "24/06/2026 10:32",
    mensajeOriginal: "Hola, envío mi INE. Mi nombre es Sofía Ramírez.",
    estado: "pendiente",
    datosExtraidos: { nombre: "Sofía Ramírez", rfc: null, curp: "RASO990101MDFMFR09", tipoDocumento: "INE", vigencia: "2030", confianza: 92 },
  },
  {
    id: "HUE-002",
    archivo: "csf_fernando.pdf",
    archivoUrl: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    mimeType: "application/pdf",
    tipoDetectado: "CSF",
    canal: "Correo",
    remitente: "fernando@email.com",
    timestamp: "24/06/2026 10:41",
    mensajeOriginal: "Adjunto mi constancia de situación fiscal para continuar el trámite.",
    estado: "pendiente",
    datosExtraidos: { nombre: "Fernando Reyes", rfc: "REFE990101XXX", curp: null, tipoDocumento: "CSF", regimen: "Persona Física", domicilioFiscal: "CDMX", confianza: 88 },
  },
  {
    id: "HUE-003",
    archivo: "comprobante_luz.jpg",
    archivoUrl: "https://placehold.co/400x600/DBEAFE/1F2937?text=Comprobante+Luz",
    mimeType: "image/png",
    tipoDetectado: "Comprobante",
    canal: "WhatsApp",
    remitente: "+52 55 8888 7777",
    timestamp: "24/06/2026 11:15",
    mensajeOriginal: "Buenas tardes, mando mi comprobante. Espero que sea el correcto, cualquier cosa me avisan.",
    estado: "pendiente",
    datosExtraidos: { nombre: "Miguel Vargas", rfc: null, curp: null, tipoDocumento: "Comprobante", domicilio: "Av. Reforma 123, CDMX", fechaEmision: "01/04/2026", confianza: 74 },
  },
  {
    id: "HUE-004",
    archivo: "documento_sin_contexto.pdf",
    tipoDetectado: "desconocido",
    canal: "Correo",
    remitente: "cliente_desconocido@email.com",
    timestamp: "24/06/2026 11:28",
    mensajeOriginal: "Adjunto el documento solicitado.",
    estado: "pendiente",
    datosExtraidos: null,
  },
  {
    id: "HUE-005",
    archivo: "curp_carlos.jpg",
    archivoUrl: "https://placehold.co/400x600/DBEAFE/111827?text=CURP+Carlos",
    mimeType: "image/jpeg",
    tipoDetectado: "CURP",
    canal: "Upload",
    remitente: "Ana López",
    timestamp: "24/06/2026 12:03",
    mensajeOriginal: "Carga manual desde recepción.",
    estado: "asignado",
    datosExtraidos: { nombre: "Carlos Hernández", rfc: null, curp: "HECC990101HDFRRL08", tipoDocumento: "CURP", confianza: 95 },
  },
];

// --- Helpers -----------------------------------------------------------------

function getExtension(archivo = "") {
  const parts = archivo.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function esImagen(ext) {
  return ["jpg", "jpeg", "png", "webp"].includes(ext);
}

function confianzaColor(n) {
  if (n >= 90) return { color: "#10B981", bg: "#D1FAE5" };
  if (n >= 75) return { color: "#F59E0B", bg: "#FEF3C7" };
  return { color: "#EF4444", bg: "#FEE2E2" };
}

// Formatea una fecha ISO del backend a texto legible en español.
function fmtFecha(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function esHoy(iso) {
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

function matchesDateFilter(iso, filter) {
  if (filter === "todas") return true;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return true;
  if (filter === "hoy") return esHoy(iso);
  const diffDias = Math.floor((new Date() - d) / 86400000);
  if (filter === "7dias") return diffDias >= 0 && diffDias <= 7;
  if (filter === "30dias") return diffDias >= 0 && diffDias <= 30;
  return true;
}

// Opciones de los dropdowns de filtro (value = código backend; label = español).
const CHANNEL_OPTIONS = [
  { value: "todos", label: "Todos los canales" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "EMAIL", label: "Correo" },
  { value: "DIRECT_UPLOAD", label: "Carga manual" },
];

const TYPE_OPTIONS = [
  { value: "todos", label: "Todos los tipos" },
  { value: "OFFICIAL_ID", label: "INE" },
  { value: "CURP", label: "CURP" },
  { value: "TAX_STATUS_CERT", label: "CSF" },
  { value: "PROOF_OF_ADDRESS", label: "Comprobante de Domicilio" },
  { value: "UNKNOWN", label: "Desconocido" },
];

const DATE_OPTIONS = [
  { value: "todas", label: "Todas las fechas" },
  { value: "hoy", label: "Hoy" },
  { value: "7dias", label: "Últimos 7 días" },
  { value: "30dias", label: "Últimos 30 días" },
];

// =============================================================================
// Sub-componentes
// =============================================================================

function StateBadge({ estado, small }) {
  const cfg = estadoConfig[estado] ?? estadoConfig.DISCARDED;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ${
        small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
      }`}
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      <span className="rounded-full shrink-0" style={{ width: 6, height: 6, backgroundColor: cfg.dot }} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

function TipoChip({ tipo }) {
  const cfg = tipoDetectadoConfig[tipo] ?? tipoDetectadoConfig.UNKNOWN;
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  );
}

function FauxPdf() {
  const widths = ["85%", "70%", "92%", "60%", "78%", "88%", "55%"];
  return (
    <div className="absolute inset-0 flex flex-col" style={{ backgroundColor: "#FDFCFA" }}>
      <div style={{ height: 8, backgroundColor: "#111827" }} />
      <div className="flex-1 px-3 py-3 space-y-1.5">
        {widths.map((w, i) => (
          <div key={i} className="rounded-sm" style={{ height: 5, width: w, backgroundColor: "#E5E7EB" }} />
        ))}
      </div>
      <div className="flex items-center justify-between px-3 py-1.5" style={{ borderTop: "1px solid #F3F4F6" }}>
        <FileText size={11} style={{ color: "#9CA3AF" }} />
        <span className="text-[9px] font-mono" style={{ color: "#9CA3AF" }}>1 / 1</span>
      </div>
    </div>
  );
}

function FauxImg() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #EDE9FE 0%, #FAF5FF 50%, #DBEAFE 100%)" }}
    >
      <div className="flex items-center justify-center rounded-lg bg-white" style={{ width: "70%", height: "60%" }}>
        <ImageIcon size={20} style={{ color: "#D1D5DB" }} />
      </div>
    </div>
  );
}

function FauxGeneric() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5" style={{ backgroundColor: "#F9FAFB" }}>
      <HelpCircle size={20} style={{ color: "#9CA3AF" }} />
      <span className="text-[9px] font-mono" style={{ color: "#9CA3AF" }}>Desconocido</span>
    </div>
  );
}

function DocThumbnail({ doc, onClick, size = "normal" }) {
  const ext = getExtension(doc.archivo);
  const dims = size === "large" ? { width: 240, height: 320 } : { width: 120, height: 150 };

  const tieneArchivo = !!doc.archivoUrl;
  const esImg = esImagen(ext) || (doc.mimeType || "").startsWith("image/");
  const esPdf = ext === "pdf" || doc.mimeType === "application/pdf";

  const clickable = tieneArchivo && typeof onClick === "function";

  let contenido;
  if (tieneArchivo && esImg) {
    contenido = (
      <img src={doc.archivoUrl} alt={doc.archivo} className="absolute inset-0 h-full w-full object-cover" />
    );
  } else if (tieneArchivo && esPdf && size === "large") {
    contenido = (
      <iframe src={doc.archivoUrl} title={doc.archivo} className="absolute inset-0 h-full w-full" style={{ border: "none" }} />
    );
  } else if (ext === "pdf") {
    contenido = <FauxPdf />;
  } else if (esImagen(ext)) {
    contenido = <FauxImg />;
  } else {
    contenido = <FauxGeneric />;
  }

  const ExtChip = (
    <span
      className="absolute right-1.5 top-1.5 rounded px-1 py-0.5 text-[9px] font-medium uppercase text-white"
      style={{ backgroundColor: "rgba(17,24,39,0.7)" }}
    >
      {ext || "?"}
    </span>
  );

  if (!clickable) {
    return (
      <div className="relative shrink-0 overflow-hidden rounded-lg" style={{ ...dims, border: "1px solid #E5E7EB" }}>
        {contenido}
        {ExtChip}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative shrink-0 overflow-hidden rounded-lg"
      style={{ ...dims, cursor: "zoom-in", border: "1px solid #E5E7EB" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#D1D5DB")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#E5E7EB")}
      aria-label={`Ver ${doc.archivo} en grande`}
    >
      {contenido}
      {ExtChip}

      <span
        className="absolute bottom-1.5 right-1.5 flex items-center justify-center rounded p-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        style={{ backgroundColor: "rgba(17,24,39,0.7)" }}
        aria-hidden="true"
      >
        <ZoomIn size={11} className="text-white" />
      </span>
    </button>
  );
}

function ExtractedData({ datos }) {
  if (!datos) {
    return (
      <div className="rounded-lg p-3" style={{ backgroundColor: "#FAFAF7", border: "1px dashed #E5E7EB" }}>
        <p className="text-[11px] italic" style={{ color: "#9CA3AF" }}>Sin datos extraídos todavía</p>
      </div>
    );
  }

  const conf = confianzaColor(datos.confianza ?? 0);

  const campos = [
    { key: "nombre", label: "nombre", mono: false },
    { key: "rfc", label: "rfc", mono: true },
    { key: "curp", label: "curp", mono: true },
    { key: "tipoDocumento", label: "tipo", mono: false },
    { key: "vigencia", label: "vigencia", mono: false },
    { key: "regimen", label: "régimen", mono: false },
    { key: "domicilioFiscal", label: "dom. fiscal", mono: false },
    { key: "domicilio", label: "domicilio", mono: false },
    { key: "codigo_postal", label: "c.p.", mono: true },
    { key: "fechaEmision", label: "f. emisión", mono: false },
  ].filter((c) => datos[c.key]);

  return (
    <div className="rounded-lg p-3" style={{ backgroundColor: "#FAFAF7", border: "1px solid #F3F4F6" }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider" style={{ color: "#6B7280" }}>
          <Sparkles size={10} />
          Datos extraídos
        </span>
        {datos.confianza != null && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums" style={{ backgroundColor: conf.bg, color: conf.color }}>
            {datos.confianza}% confianza
          </span>
        )}
      </div>
      {campos.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {campos.map((c) => (
            <div key={c.key} className="min-w-0">
              <span className="text-[10px]" style={{ color: "#9CA3AF" }}>{c.label}: </span>
              <span
                className={`text-[11px] font-medium ${c.mono ? "font-mono tabular-nums" : ""}`}
                style={{ color: "#374151" }}
              >
                {datos[c.key]}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] italic" style={{ color: "#9CA3AF" }}>Sin campos reconocidos</p>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono, children }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-[10px] uppercase tracking-wider" style={{ color: "#9CA3AF" }}>{label}</span>
      {children ? (
        <div className="min-w-0">{children}</div>
      ) : (
        <span className={`text-[12px] ${mono ? "font-mono tabular-nums" : ""}`} style={{ color: "#374151" }}>{value}</span>
      )}
    </div>
  );
}

function CanalChip({ canal }) {
  const cfg = canalConfig[canal] ?? canalConfig.DIRECT_UPLOAD;
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: cfg.bg, color: cfg.color }}>
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

function FilterDropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const isDefault = options[0]?.value === value;
  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[13px] transition-colors"
        style={{
          border: `1px solid ${open ? "#D1D5DB" : "#E5E7EB"}`,
          color: isDefault ? "#374151" : "#111827",
          fontWeight: isDefault ? 400 : 500,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#D1D5DB")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = open ? "#D1D5DB" : "#E5E7EB")}
      >
        {isDefault ? label : selected?.label}
        <ChevronDown
          size={13}
          style={{ color: "#9CA3AF", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15, ease: EASE_OUT }}
              className="absolute right-0 z-40 mt-2 min-w-[190px] overflow-hidden rounded-xl bg-white py-1"
              style={{ border: "1px solid #E5E7EB", boxShadow: "0 8px 24px rgba(17,24,39,0.10)" }}
            >
              {options.map((o) => {
                const active = o.value === value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-[13px] transition-colors"
                    style={{ backgroundColor: active ? "#FAFAF7" : "transparent", color: active ? "#111827" : "#374151" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#FAFAF7")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = active ? "#FAFAF7" : "transparent")}
                  >
                    {o.label}
                    {active && <CheckCircle2 size={13} style={{ color: "#111827" }} />}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function SummaryCard({ label, count, icon: Icon, color, dot, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: EASE_OUT }}
      className="rounded-2xl bg-white p-4"
      style={{ border: "1px solid #E5E7EB" }}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span className="rounded-full" style={{ width: 6, height: 6, backgroundColor: dot }} aria-hidden="true" />
        <Icon size={14} strokeWidth={1.75} style={{ color }} />
      </div>
      <p className="mb-1 text-[24px] font-medium leading-none tabular-nums" style={{ color: "#111827" }}>{count}</p>
      <p className="text-[12px]" style={{ color: "#6B7280" }}>{label}</p>
    </motion.div>
  );
}

function OrphanDocumentRow({ doc, onPreview, onAsignar, onCrearExpediente, onDescartar, delay }) {
  const esPendiente = doc.estado === "PENDING";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: esPendiente ? 1 : 0.7, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, delay, ease: EASE_OUT }}
      whileHover={{ borderColor: "#D1D5DB" }}
      className="rounded-2xl bg-white p-5"
      style={{ border: "1px solid #E5E7EB" }}
    >
      <div className="flex flex-wrap gap-5 sm:flex-nowrap">
        {/* Izquierda: thumbnail */}
        <DocThumbnail doc={doc} onClick={() => onPreview(doc)} />

        {/* Centro */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-[14px] font-semibold" style={{ color: "#111827" }}>{doc.archivo}</h3>
              <TipoChip tipo={doc.tipoDetectado} />
            </div>
            <StateBadge estado={doc.estado} />
          </div>

          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <CanalChip canal={doc.canal} />
            <span className="text-[11px]" style={{ color: "#6B7280" }}>{doc.remitente}</span>
            <span style={{ color: "#D1D5DB" }}>·</span>
            <span className="text-[11px] tabular-nums" style={{ color: "#9CA3AF" }}>{fmtFecha(doc.timestamp)}</span>
          </div>

          {doc.mensajeOriginal && (
            <p
              className="line-clamp-2 text-[12px] italic leading-relaxed"
              style={{ borderLeft: "2px solid #E5E7EB", paddingLeft: 10, color: "#4B5563" }}
            >
              “{doc.mensajeOriginal}”
            </p>
          )}

          {doc.expedienteSugerido && (
            <p className="mt-2 text-[11px]" style={{ color: "#6B7280" }}>
              <Sparkles size={11} className="mr-1 inline" style={{ color: ACCENT }} />
              Coincidencia sugerida:{" "}
              <span className="font-mono" style={{ color: "#374151" }}>{doc.expedienteSugerido.codigo}</span>
              {" · "}{doc.expedienteSugerido.clienteNombre}
            </p>
          )}

          <div className="mt-3">
            <ExtractedData datos={doc.datosExtraidos} />
          </div>
        </div>
      </div>

      {/* Acciones / estado terminal */}
      {esPendiente ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 pt-4" style={{ borderTop: "1px solid #F3F4F6" }}>
          <button
            type="button"
            onClick={() => onAsignar(doc)}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-medium text-white transition-colors"
            style={{ backgroundColor: "#111827" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1F2937")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#111827")}
          >
            <Link2 size={12} />
            Asignar a expediente
          </button>

          <button
            type="button"
            onClick={() => onCrearExpediente(doc)}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-medium transition-colors"
            style={{ border: "1px solid #E5E7EB", color: "#374151" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#D1D5DB"; e.currentTarget.style.color = "#111827"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.color = "#374151"; }}
          >
            <Plus size={12} />
            Crear expediente
          </button>

          <span className="flex-1" />

          <button
            type="button"
            onClick={() => onDescartar(doc)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] transition-colors"
            style={{ color: "#9CA3AF" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#B91C1C"; e.currentTarget.style.backgroundColor = "#FEE2E2"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#9CA3AF"; e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            <Trash2 size={12} />
            Descartar
          </button>
        </div>
      ) : (
        <div className="mt-4 pt-4 text-[12px]" style={{ borderTop: "1px solid #F3F4F6", color: "#9CA3AF" }}>
          {doc.estado === "ASSIGNED"
            ? "Documento ya asignado a un expediente"
            : "Documento descartado"}
        </div>
      )}
    </motion.div>
  );
}

// =============================================================================
// Pantalla principal
// =============================================================================

/**
 * @param {{
 *   onVolverDashboard?: () => void,
 *   onAsignar?: (payload: any) => void,
 *   onCrearExpediente?: (prefill: any) => void,
 *   onIrAlExpediente?: (expediente: any) => void,
 * }} [props]
 */
export default function OrphanQueuePage({
  onVolverDashboard,
  onAsignar,
  onCrearExpediente,
  onIrAlExpediente,
} = {}) {
  const [documentos, setDocumentos] = useState([]);
  const [expedientes, setExpedientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [search, setSearch] = useState("");
  const [activeStatusFilter, setActiveStatusFilter] = useState("todos");
  const [channelFilter, setChannelFilter] = useState("todos");
  const [typeFilter, setTypeFilter] = useState("todos");
  const [dateFilter, setDateFilter] = useState("todas");
  const [preview, setPreview] = useState(null);
  const [confirmDiscard, setConfirmDiscard] = useState(null);
  const [selectedOrphanDocument, setSelectedOrphanDocument] = useState(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const toastTimer = useRef(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Carga inicial: huérfanos + expedientes asignables (para el modal P7).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [orphans, exps] = await Promise.all([
          huerfanosService.listar(),
          expedientesService.getExpedientes(),
        ]);
        if (cancelled) return;
        setDocumentos(orphans.map(adaptarHuerfano));
        setExpedientes(exps.map(adaptarExpedienteAsignable));
      } catch (e) {
        if (!cancelled) setLoadError(e?.message || "No se pudieron cargar los documentos");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function showToast(msg) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documentos.filter((d) => {
      const matchesStatus =
        activeStatusFilter === "todos" || d.estado === activeStatusFilter;
      const matchesChannel =
        channelFilter === "todos" || d.canal === channelFilter;
      const matchesType = typeFilter === "todos" || d.tipoDetectado === typeFilter;
      const matchesDate = matchesDateFilter(d.timestamp, dateFilter);
      const matchesSearch =
        q === "" ||
        [
          d.archivo,
          d.remitente,
          d.mensajeOriginal,
          d.tipoDetectado,
          d.datosExtraidos?.nombre,
          d.datosExtraidos?.rfc,
          d.datosExtraidos?.curp,
        ].some((c) => c && c.toLowerCase().includes(q));

      return (
        matchesStatus &&
        matchesChannel &&
        matchesType &&
        matchesDate &&
        matchesSearch
      );
    });
  }, [documentos, search, activeStatusFilter, channelFilter, typeFilter, dateFilter]);

  const conteos = useMemo(() => {
    const c = { PENDING: 0, ASSIGNED: 0, DISCARDED: 0, hoy: 0 };
    for (const d of documentos) {
      if (c[d.estado] != null) c[d.estado]++;
      if (esHoy(d.timestamp)) c.hoy++;
    }
    return c;
  }, [documentos]);

  // --- Navegación ---
  function handleVolverDashboard() {
    if (onVolverDashboard) onVolverDashboard();
    else showToast("→ Volver al dashboard");
  }

  // --- P7: Asignar a expediente existente (modal AssignOrphanModal) ---
  function handleAssignToExpediente(documento) {
    setSelectedOrphanDocument(documento);
    setIsAssignModalOpen(true);
  }

  // onAssign: persiste la asignación en el backend. Si lanza, el modal muestra el
  // error y no marca como asignado.
  async function handleAssignPersist(documento, expediente) {
    await huerfanosService.asignar(
      documento.id,
      expediente.id,
      documento.tipoDetectado === "UNKNOWN" ? null : documento.tipoDetectado,
    );
    setDocumentos((prev) =>
      prev.map((d) =>
        d.id === documento.id ? { ...d, estado: "ASSIGNED" } : d,
      ),
    );
    if (onAsignar) onAsignar({ documento, expediente });
  }

  function handleAssignSuccess() {
    showToast("Documento asignado correctamente");
  }

  // --- P3: Crear expediente desde el documento (prefill) ---
  function handleCreateExpedienteFromDocument(documento) {
    const prefillNuevaVenta = {
      nombreCliente: documento.datosExtraidos?.nombre || "",
      telefono: documento.canal === "WHATSAPP" ? documento.remitente : "",
      correo: documento.canal === "EMAIL" ? documento.remitente : "",
      rfc: documento.datosExtraidos?.rfc || "",
      tipoOperacion: "",
      montoEstimado: "",
      documentoOrigen: {
        id: documento.id,
        archivo: documento.archivo,
        tipoDetectado: documento.tipoDetectado,
        canal: documento.canal,
        remitente: documento.remitente,
        timestamp: documento.timestamp,
        datosExtraidos: documento.datosExtraidos,
      },
    };
    if (onCrearExpediente) onCrearExpediente(prefillNuevaVenta);
    else showToast("→ Nueva venta con datos prellenados desde huérfano");
  }

  async function handleDiscard(documento) {
    try {
      await huerfanosService.descartar(
        documento.id,
        "Descartado desde la cola de huérfanos",
      );
      setDocumentos((prev) =>
        prev.map((d) => (d.id === documento.id ? { ...d, estado: "DISCARDED" } : d)),
      );
      setConfirmDiscard(null);
      showToast("Documento descartado");
    } catch (e) {
      setConfirmDiscard(null);
      showToast("Error al descartar el documento");
    }
  }

  const filtrosEstado = [
    { value: "todos", label: "Todos" },
    { value: "PENDING", label: "Pendientes" },
    { value: "ASSIGNED", label: "Asignados" },
    { value: "DISCARDED", label: "Descartados" },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: BG, color: "#111827" }}>
      {/* HEADER */}
      <header className="bg-white" style={{ borderBottom: "1px solid #E5E7EB" }}>
        <div className="mx-auto max-w-[1400px] px-10 py-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleVolverDashboard}
                className="flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3.5 py-2 text-[12px] font-medium text-[#4B5563] transition-colors"
                style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.08)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#D1D5DB";
                  e.currentTarget.style.color = "#111827";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#E5E7EB";
                  e.currentTarget.style.color = "#4B5563";
                }}
                aria-label="Volver al dashboard"
              >
                <ArrowLeft size={16} />
                <span>Dashboard</span>
                <ChevronRight size={11} style={{ color: "#D1D5DB" }} />
              </button>
              <span className="text-[12px] text-[#6B7280]">Cola de Huérfanos</span>
            </div>

            <button
              type="button"
              onClick={handleVolverDashboard}
              className="rounded-full bg-white px-3.5 py-2 text-xs transition-colors"
              style={{ border: "1px solid #E5E7EB", color: "#374151" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#D1D5DB")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#E5E7EB")}
            >
              Volver al dashboard
            </button>
          </div>

          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight" style={{ color: "#111827" }}>Cola de Huérfanos</h1>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
            >
              <AlertCircle size={11} />
              {conteos.PENDING} pendientes
            </span>
          </div>
          <p className="mt-1 text-[13px]" style={{ color: "#6B7280" }}>
            Documentos recibidos que aún no están asociados a un expediente
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-10 py-7">
        {/* SUMMARY CARDS */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Pendientes" count={conteos.PENDING} icon={Clock} color="#F59E0B" dot="#F59E0B" delay={0} />
          <SummaryCard label="Asignados" count={conteos.ASSIGNED} icon={CheckCircle2} color="#10B981" dot="#10B981" delay={0.05} />
          <SummaryCard label="Descartados" count={conteos.DISCARDED} icon={X} color="#9CA3AF" dot="#9CA3AF" delay={0.1} />
          <SummaryCard label="Recibidos hoy" count={conteos.hoy} icon={Calendar} color="#3B82F6" dot="#3B82F6" delay={0.15} />
        </div>

        {/* ACTION BAR */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[300px] flex-1">
            <Search size={14} style={{ color: "#9CA3AF" }} className="absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por archivo, remitente, mensaje, RFC o cliente"
              aria-label="Buscar documentos huérfanos"
              className="w-full rounded-full bg-white py-2.5 pl-10 pr-4 text-[13px] outline-none transition-colors"
              style={{ border: "1px solid #E5E7EB", color: "#374151" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#E5E7EB")}
            />
          </div>

          {/* Segmented control de estado */}
          <div className="flex items-center rounded-full bg-white p-0.5" style={{ border: "1px solid #E5E7EB" }}>
            {filtrosEstado.map((f) => {
              const activo = activeStatusFilter === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setActiveStatusFilter(f.value)}
                  className="rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors"
                  style={{
                    backgroundColor: activo ? "#111827" : "transparent",
                    color: activo ? "#FFFFFF" : "#6B7280",
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Dropdowns de filtro funcionales */}
          <FilterDropdown label="Canal" options={CHANNEL_OPTIONS} value={channelFilter} onChange={setChannelFilter} />
          <FilterDropdown label="Tipo detectado" options={TYPE_OPTIONS} value={typeFilter} onChange={setTypeFilter} />
          <FilterDropdown label="Fecha" options={DATE_OPTIONS} value={dateFilter} onChange={setDateFilter} />
        </div>

        {/* LISTA */}
        <div className="space-y-3">
          {loading ? (
            <div className="rounded-2xl bg-white px-5 py-16 text-center" style={{ border: "1px solid #E5E7EB" }}>
              <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2" style={{ borderColor: ACCENT, borderTopColor: "transparent" }} />
              <p className="text-[13px]" style={{ color: "#6B7280" }}>Cargando documentos…</p>
            </div>
          ) : loadError ? (
            <div className="rounded-2xl bg-white px-5 py-16 text-center" style={{ border: "1px solid #E5E7EB" }}>
              <AlertCircle size={22} className="mx-auto mb-2" style={{ color: "#EF4444" }} />
              <p className="text-[13px]" style={{ color: "#6B7280" }}>{loadError}</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filtrados.length > 0 ? (
                filtrados.map((doc, i) => (
                  <OrphanDocumentRow
                    key={doc.id}
                    doc={doc}
                    delay={i * 0.04}
                    onPreview={setPreview}
                    onAsignar={handleAssignToExpediente}
                    onCrearExpediente={handleCreateExpedienteFromDocument}
                    onDescartar={setConfirmDiscard}
                  />
                ))
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: EASE_OUT }}
                  className="rounded-2xl bg-white px-5 py-16 text-center"
                  style={{ border: "1px solid #E5E7EB" }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
                    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
                  </svg>
                  <p className="text-[13px]" style={{ color: "#6B7280" }}>
                    No hay documentos que coincidan con los filtros.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </main>

      {/* PREVIEW MODAL */}
      <AnimatePresence>
        {preview && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            style={{ backgroundColor: "rgba(17,24,39,0.5)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setPreview(null)}
          >
            <motion.div
              className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white"
              style={{ border: "1px solid #E5E7EB", maxHeight: "90vh" }}
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #E5E7EB" }}>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[13px] font-semibold" style={{ color: "#111827" }}>{preview.archivo}</span>
                  <TipoChip tipo={preview.tipoDetectado} />
                  <StateBadge estado={preview.estado} small />
                </div>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                  style={{ color: "#6B7280" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F9FAFB")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  aria-label="Cerrar"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="grid gap-6 p-6 md:grid-cols-[280px_1fr]" style={{ backgroundColor: "#FAFAF7", overflowY: "auto", maxHeight: "calc(90vh - 57px)" }}>
                <div className="flex justify-center">
                  <DocThumbnail doc={preview} size="large" />
                </div>

                <div className="space-y-3">
                  <DetailRow label="Canal">
                    <CanalChip canal={preview.canal} />
                  </DetailRow>
                  <DetailRow label="Remitente" value={preview.remitente} />
                  <DetailRow label="Recepción" value={fmtFecha(preview.timestamp)} mono />

                  {preview.mensajeOriginal && (
                    <div className="rounded-lg bg-white p-3" style={{ border: "1px solid #F3F4F6" }}>
                      <p className="mb-1 text-[10px] uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Mensaje original</p>
                      <p className="text-[12px] italic leading-relaxed" style={{ color: "#4B5563" }}>“{preview.mensajeOriginal}”</p>
                    </div>
                  )}

                  <ExtractedData datos={preview.datosExtraidos} />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONFIRM DISCARD MODAL */}
      <AnimatePresence>
        {confirmDiscard && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            style={{ backgroundColor: "rgba(17,24,39,0.5)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setConfirmDiscard(null)}
          >
            <motion.div
              className="w-full max-w-sm rounded-2xl bg-white p-6"
              style={{ border: "1px solid #E5E7EB" }}
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 8 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-5 flex gap-3">
                <span className="flex shrink-0 items-center justify-center rounded-full" style={{ width: 36, height: 36, backgroundColor: "#FEE2E2" }}>
                  <Trash2 size={15} style={{ color: "#B91C1C" }} />
                </span>
                <div>
                  <h2 className="text-[14px] font-semibold" style={{ color: "#111827" }}>¿Descartar este documento?</h2>
                  <p className="mt-1 text-[12px]" style={{ color: "#6B7280" }}>
                    El documento <span className="font-mono" style={{ color: "#374151" }}>{confirmDiscard.archivo}</span> quedará marcado como descartado y no aparecerá como pendiente.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDiscard(null)}
                  className="rounded-full px-4 py-2 text-[12px] font-medium transition-colors"
                  style={{ border: "1px solid #E5E7EB", color: "#374151" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#D1D5DB")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#E5E7EB")}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleDiscard(confirmDiscard)}
                  className="rounded-full px-4 py-2 text-[12px] font-medium text-white transition-colors"
                  style={{ backgroundColor: "#B91C1C" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#991B1B")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#B91C1C")}
                >
                  Descartar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* P7 — ASSIGN MODAL */}
      <AssignOrphanModal
        isOpen={isAssignModalOpen}
        documento={selectedOrphanDocument}
        expedientes={expedientes}
        onClose={() => setIsAssignModalOpen(false)}
        onAssign={handleAssignPersist}
        onAssigned={handleAssignSuccess}
        onIrAlExpediente={onIrAlExpediente}
      />

      {/* TOAST */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
          >
            <div
              className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-white"
              style={{ backgroundColor: "#111827", boxShadow: "0 4px 12px rgba(17,24,39,0.18)" }}
            >
              <CheckCircle2 size={13} style={{ color: ACCENT }} />
              <span className="text-xs">{toast}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
