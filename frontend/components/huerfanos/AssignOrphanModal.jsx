"use client";

// =============================================================================
// P7 — Modal "Asignar documento huérfano a expediente"
// -----------------------------------------------------------------------------
// Módulo integrable y presentacional. NO navega, NO llama APIs, NO persiste.
// Recibe TODO por props y comunica acciones por callbacks. El host (P6) conecta
// router/store/backend dentro de onAssign / onAssigned / onIrAlExpediente.
//
// CONTRATO de onAssign(documento, expediente)  →  Promise|void
//   El HOST (no este modal) debe, al asignar:
//     • cambiar el estado del documento huérfano a "asignado";
//     • agregar evento al historial del expediente:
//         tipo: "asignacion_desde_huerfano",
//         descripcion: `Documento ${documento.archivo} asignado desde Cola de
//                       Huérfanos al expediente ${expediente.codigo}`,
//         timestamp: ahora, usuario: <capturista actual>;
//     • recalcular checklist: si tipoDetectado ∈ {INE,CURP,CSF,Comprobante}
//         marcar ese documento como "recibido";
//     • recalcular next steps: remover el "falta X", agregar "Documento recibido,
//         pendiente de validar"; si todos recibidos → "Listo para validación final".
//   P7 NO ejecuta nada de eso: solo lo delega vía onAssign y refleja carga/éxito/error.
//
// PREVIEW: <DocumentPreview> renderiza el ARCHIVO REAL automáticamente cuando el
//   documento trae archivoUrl + mimeType (img/iframe). Sin archivoUrl cae a un
//   placeholder "faux" solo visual. No requiere cambios cuando llegue el backend.
// =============================================================================

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  FileText,
  User,
  Mail,
  Phone,
  BadgeCheck,
  Link2,
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  Loader2,
  ArrowRight,
  Check,
} from "lucide-react";

const EASE_OUT = [0.16, 1, 0.3, 1];
const ACCENT = "#F19B42";
const ACCENT_HOVER = "#E08930";
const SUCCESS = "#10B981";

const estadoGlobalConfig = {
  en_captura: { label: "En captura", dot: "#3B82F6", bg: "#DBEAFE", text: "#1E40AF" },
  en_recepcion: { label: "En recepción", dot: "#8B5CF6", bg: "#EDE9FE", text: "#6D28D9" },
  en_validacion: { label: "En validación", dot: "#F59E0B", bg: "#FEF3C7", text: "#92400E" },
  completo: { label: "Completo", dot: "#10B981", bg: "#D1FAE5", text: "#047857" },
  incompleto_vencido: { label: "Vencido", dot: "#EF4444", bg: "#FEE2E2", text: "#B91C1C" },
};

const matchToneConfig = {
  high: { bg: "#D1FAE5", text: "#047857", dot: "#10B981" },
  mid: { bg: "#DBEAFE", text: "#1E40AF", dot: "#3B82F6" },
  low: { bg: "#FEF3C7", text: "#92400E", dot: "#F59E0B" },
};

const tipoOperacionLabel = {
  blindaje: "Blindaje",
  venta_vehiculo: "Venta de vehículo",
};

// --- Helpers -----------------------------------------------------------------

function ci(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

// Valor inicial del buscador, según prioridad de los datos extraídos.
function getAutoPrefill(doc) {
  if (!doc) return "";
  const d = doc.datosExtraidos || {};
  if (d.rfc) return d.rfc;
  if (d.nombre) return d.nombre;
  // canal WhatsApp / Correo / otro → siempre cae al remitente
  return doc.remitente || "";
}

function calculateMatchScore(doc, exp) {
  const d = doc?.datosExtraidos || {};
  const rfcExt = ci(d.rfc);
  const nombreExt = ci(d.nombre);
  const remit = ci(doc?.remitente);

  if (rfcExt && rfcExt === ci(exp.rfc)) {
    return { score: 100, motivo: "Coincidencia alta por RFC", tone: "high" };
  }
  if (nombreExt && nombreExt === ci(exp.cliente)) {
    return { score: 85, motivo: "Coincidencia por nombre", tone: "mid" };
  }
  const telExp = ci(exp.telefono).replace(/\s/g, "");
  const remitTel = remit.replace(/\s/g, "");
  if (remit && (remit === ci(exp.correo) || (telExp && remitTel === telExp))) {
    return { score: 75, motivo: "Coincidencia por remitente", tone: "mid" };
  }
  if (nombreExt) {
    const primer = nombreExt.split(/\s+/)[0];
    if (primer && ci(exp.cliente).includes(primer)) {
      return { score: 50, motivo: "Coincidencia parcial", tone: "low" };
    }
  }
  return { score: 0, motivo: null, tone: "none" };
}

function confianzaColor(n) {
  if (n >= 90) return { color: "#10B981", bg: "#D1FAE5" };
  if (n >= 75) return { color: "#F59E0B", bg: "#FEF3C7" };
  return { color: "#EF4444", bg: "#FEE2E2" };
}

function getExt(name = "") {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function esImagen(doc) {
  if (!doc) return false;
  if ((doc.mimeType || "").startsWith("image/")) return true;
  return ["jpg", "jpeg", "png", "webp"].includes(getExt(doc.archivoUrl || doc.archivo));
}

function esPdf(doc) {
  if (!doc) return false;
  if (doc.mimeType === "application/pdf") return true;
  return getExt(doc.archivoUrl || doc.archivo) === "pdf";
}

// =============================================================================
// Sub-componentes
// =============================================================================

function EstadoBadge({ estado }) {
  const cfg = estadoGlobalConfig[estado];
  if (!cfg) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      <span className="rounded-full shrink-0" style={{ width: 6, height: 6, backgroundColor: cfg.dot }} aria-hidden="true" />
      {cfg.label}
    </span>
  );
}

function MatchBadge({ match }) {
  if (!match || !match.motivo) return null;
  const cfg = matchToneConfig[match.tone] ?? matchToneConfig.low;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      <Sparkles size={10} style={{ color: cfg.dot }} />
      {match.motivo}
    </span>
  );
}

// Placeholder visual cuando NO hay archivoUrl (o falla la carga).
function FauxPreview({ doc, generic }) {
  if (generic) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5" style={{ backgroundColor: "#F9FAFB" }}>
        <FileText size={22} style={{ color: "#9CA3AF" }} />
        <span className="px-2 text-center text-[9px] font-mono" style={{ color: "#9CA3AF" }}>
          {doc?.archivo || "documento"}
        </span>
      </div>
    );
  }
  if (esPdf(doc)) {
    const widths = ["85%", "70%", "92%", "60%", "78%", "88%", "55%"];
    return (
      <div className="absolute inset-0 flex flex-col" style={{ backgroundColor: "#FDFCFA" }}>
        <div style={{ height: 8, backgroundColor: "#111827" }} />
        <div className="flex-1 space-y-1.5 px-3 py-3">
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
  // imagen / desconocido → mock de imagen
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4" style={{ background: "linear-gradient(135deg, #EDE9FE 0%, #FAF5FF 50%, #DBEAFE 100%)" }}>
      <div className="flex items-center justify-center rounded-lg bg-white" style={{ width: "70%", height: "60%" }}>
        <ImageIcon size={20} style={{ color: "#D1D5DB" }} />
      </div>
    </div>
  );
}

// Cuando el backend entregue archivoUrl + mimeType reales, esta preview los
// muestra automáticamente; sin archivoUrl cae al placeholder faux.
function DocumentPreview({ doc, size = "small", onExpand }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setFailed(false));
  }, [doc?.archivoUrl]);

  const dims =
    size === "large"
      ? { width: "100%", height: "100%" }
      : { width: 120, height: 150 };

  const tieneArchivo = !!doc?.archivoUrl && !failed;
  const clickable = typeof onExpand === "function";

  let contenido;
  if (tieneArchivo && esImagen(doc)) {
    contenido = (
      <img
        src={doc.archivoUrl}
        alt={doc.archivo}
        loading="lazy"
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  } else if (tieneArchivo && esPdf(doc)) {
    // Si el PDF viene de origen externo, el host debe ajustar CSP/headers.
    // Para blobs / objectURL locales funciona directo.
    contenido = (
      <iframe
        src={`${doc.archivoUrl}#toolbar=0&navpanes=0`}
        title={doc.archivo}
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full"
        style={{ border: "none" }}
      />
    );
  } else if (tieneArchivo) {
    contenido = <FauxPreview doc={doc} generic />;
  } else {
    contenido = <FauxPreview doc={doc} />;
  }

  const Tag = clickable ? "button" : "div";

  return (
    <Tag
      type={clickable ? "button" : undefined}
      onClick={clickable ? onExpand : undefined}
      className={`group relative overflow-hidden rounded-xl ${size === "small" ? "shrink-0" : ""}`}
      style={{
        ...dims,
        border: "1px solid rgba(229,231,235,0.8)",
        cursor: clickable ? "zoom-in" : "default",
        backgroundColor: "#FFFFFF",
      }}
      aria-label={clickable ? `Ampliar vista previa de ${doc?.archivo}` : undefined}
    >
      {contenido}

      {failed && doc?.archivoUrl && (
        <span className="absolute inset-x-0 bottom-0 bg-white/85 px-1 py-0.5 text-center text-[8px]" style={{ color: "#9CA3AF" }}>
          No se pudo cargar la vista previa
        </span>
      )}

      {clickable && (
        <span
          className="absolute bottom-1.5 right-1.5 flex items-center justify-center rounded p-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          style={{ backgroundColor: "rgba(17,24,39,0.7)" }}
          aria-hidden="true"
        >
          <ImageIcon size={11} className="text-white" />
        </span>
      )}
    </Tag>
  );
}

function MetaRow({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={12} style={{ color: "#9CA3AF" }} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <span className="block text-[10px] uppercase tracking-wider" style={{ color: "#9CA3AF" }}>{label}</span>
        <span className={`block text-[12px] ${mono ? "font-mono tabular-nums" : ""}`} style={{ color: "#374151" }}>
          {value || "—"}
        </span>
      </div>
    </div>
  );
}

function DocumentSummary({ doc, onExpandPreview }) {
  const datos = doc.datosExtraidos || null;
  const conf = datos?.confianza != null ? confianzaColor(datos.confianza) : null;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.6)" }}
    >
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>
        Documento huérfano
      </p>

      <div className="flex justify-center">
        <DocumentPreview doc={doc} size="small" onExpand={onExpandPreview} />
      </div>

      <p className="mt-3 truncate text-center text-[13px] font-semibold" style={{ color: "#111827" }}>
        {doc.archivo || "—"}
      </p>
      {doc.tipoDetectado && (
        <div className="mt-1.5 flex justify-center">
          <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ backgroundColor: "#EDE9FE", color: "#6D28D9" }}>
            {doc.tipoDetectado}
          </span>
        </div>
      )}

      <div className="mt-4 space-y-2.5">
        <MetaRow icon={Mail} label="Canal" value={doc.canal} />
        <MetaRow icon={User} label="Remitente" value={doc.remitente} />
        <MetaRow icon={FileText} label="Recibido" value={doc.timestamp} mono />
      </div>

      {datos && (
        <div className="mt-4 rounded-xl p-3" style={{ backgroundColor: "rgba(250,250,247,0.7)", border: "1px solid rgba(243,244,246,0.9)" }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider" style={{ color: "#6B7280" }}>
              <Sparkles size={10} />
              Datos extraídos
            </span>
            {conf && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums" style={{ backgroundColor: conf.bg, color: conf.color }}>
                {datos.confianza}% confianza
              </span>
            )}
          </div>
          <div className="space-y-1">
            {datos.nombre && <DatoLine k="nombre" v={datos.nombre} />}
            {datos.rfc && <DatoLine k="rfc" v={datos.rfc} mono />}
            {datos.curp && <DatoLine k="curp" v={datos.curp} mono />}
            {datos.regimen && <DatoLine k="régimen" v={datos.regimen} />}
          </div>
        </div>
      )}
    </div>
  );
}

function DatoLine({ k, v, mono }) {
  return (
    <p className="text-[11px]">
      <span style={{ color: "#9CA3AF" }}>{k}: </span>
      <span className={`font-medium ${mono ? "font-mono tabular-nums" : ""}`} style={{ color: "#374151" }}>{v}</span>
    </p>
  );
}

function ExpedienteResult({ exp, match, selected, onSelect, delay }) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay, ease: EASE_OUT }}
      whileHover={{ y: -1 }}
      className="w-full rounded-xl p-3 text-left transition-colors"
      style={{
        backgroundColor: selected ? "rgba(241,155,66,0.08)" : "rgba(255,255,255,0.6)",
        border: `1px solid ${selected ? ACCENT : "rgba(229,231,235,0.8)"}`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px]" style={{ color: "#111827" }}>{exp.codigo || "—"}</span>
          {selected && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full" style={{ backgroundColor: ACCENT }}>
              <Check size={11} className="text-white" strokeWidth={3} />
            </span>
          )}
        </div>
        <EstadoBadge estado={exp.estado} />
      </div>

      <p className="mt-1 text-[13px] font-semibold" style={{ color: "#111827" }}>{exp.cliente || "—"}</p>

      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px]" style={{ color: "#6B7280" }}>
        <span className="font-mono">{exp.rfc || "—"}</span>
        <span style={{ color: "#D1D5DB" }}>·</span>
        <span>{tipoOperacionLabel[exp.tipoOperacion] || exp.tipoOperacion || "—"}</span>
        <span style={{ color: "#D1D5DB" }}>·</span>
        <span className="tabular-nums">{exp.fechaCreacion || "—"}</span>
      </div>

      {match?.motivo && (
        <div className="mt-2">
          <MatchBadge match={match} />
        </div>
      )}
    </motion.button>
  );
}

// =============================================================================
// Modal principal
// =============================================================================

export default function AssignOrphanModal({
  isOpen,
  documento,
  expedientes,
  onClose,
  onAssign,
  onAssigned,
  onIrAlExpediente,
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assigned, setAssigned] = useState(false);
  const [assignError, setAssignError] = useState(null);
  const [previewExpandido, setPreviewExpandido] = useState(false);

  const closeTimer = useRef(null);

  // Reset al abrir; prellenar buscador con la mejor pista del documento.
  useEffect(() => {
    if (isOpen) {
      queueMicrotask(() => {
        setSearch(getAutoPrefill(documento));
        setSelected(null);
        setIsAssigning(false);
        setAssigned(false);
        setAssignError(null);
        setPreviewExpandido(false);
      });
    }
  }, [isOpen, documento]);

  // Limpiar timer en unmount.
  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const results = useMemo(() => {
    const list = (expedientes ?? []).map((exp) => ({
      exp,
      match: calculateMatchScore(documento, exp),
    }));
    const q = search.trim().toLowerCase();
    const filtered = q
      ? list.filter(({ exp }) =>
          [exp.codigo, exp.cliente, exp.rfc, exp.telefono, exp.correo].some((f) =>
            (f ?? "").toString().toLowerCase().includes(q),
          ),
        )
      : list;
    return filtered.sort((a, b) => b.match.score - a.match.score);
  }, [expedientes, documento, search]);

  if (!isOpen || !documento) return null;

  function handleSelect(exp) {
    if (isAssigning || assigned) return;
    setSelected(exp);
    setAssignError(null);
  }

  async function handleAssign() {
    if (!selected || isAssigning || assigned) return;
    setAssignError(null);
    setIsAssigning(true);
    try {
      // El HOST persiste la asignación y actualiza checklist/historial/next steps.
      await onAssign?.(documento, selected);
      setIsAssigning(false);
      setAssigned(true);
      // Notificar éxito al host (refrescar P6) tras el feedback verde (~0.7s).
      closeTimer.current = setTimeout(() => {
        onAssigned?.(documento, selected);
        // Si el host ofrece navegar a P5, dejamos el modal abierto para que el
        // usuario decida; si no, cerramos automáticamente.
        if (!onIrAlExpediente) onClose?.();
      }, 700);
    } catch {
      // No dejar el catch vacío: revertir carga y mostrar error sin cerrar.
      setIsAssigning(false);
      setAssignError("No se pudo asignar el documento");
    }
  }

  function handleOverlayClose() {
    if (isAssigning) return; // no cerrar a media asignación
    onClose?.();
  }

  const assignDisabled = !selected || isAssigning;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(17,24,39,0.25)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleOverlayClose}
        >
          <motion.div
            className="w-full max-w-3xl overflow-hidden rounded-3xl"
            style={{
              backgroundColor: "rgba(248,246,242,0.85)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.6)",
              boxShadow: "0 20px 60px rgba(17,24,39,0.18)",
              maxHeight: "88vh",
            }}
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* HEADER */}
            <div className="flex items-start justify-between px-6 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(229,231,235,0.6)" }}>
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: "#FCEEDB" }}>
                  <Link2 size={15} style={{ color: ACCENT }} />
                </span>
                <div>
                  <h2 className="text-[16px] font-semibold" style={{ color: "#111827" }}>Asignar documento huérfano</h2>
                  <p className="mt-0.5 text-[12px]" style={{ color: "#6B7280" }}>
                    Selecciona el expediente correcto para asociar este documento.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleOverlayClose}
                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
                style={{ color: "#6B7280" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.6)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            {/* BODY */}
            <div
              className="grid grid-cols-1 gap-5 overflow-y-auto p-6 md:grid-cols-[260px_1fr]"
              style={{ maxHeight: "calc(88vh - 180px)" }}
            >
              {/* IZQUIERDA */}
              <DocumentSummary doc={documento} onExpandPreview={() => setPreviewExpandido(true)} />

              {/* DERECHA */}
              <div className="min-w-0">
                <div className="mb-3">
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: "#111827" }}>
                    <Sparkles size={13} style={{ color: ACCENT }} />
                    Sugerencia automática
                  </span>
                  <p className="mt-0.5 text-[11px]" style={{ color: "#9CA3AF" }}>
                    Usamos los datos extraídos del documento para encontrar posibles expedientes.
                  </p>
                </div>

                <div className="relative mb-2">
                  <Search size={14} style={{ color: "#9CA3AF" }} className="absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por código, nombre, RFC, teléfono o correo"
                    aria-label="Buscar expediente"
                    className="w-full rounded-xl py-2.5 pl-9 pr-3 text-[13px] outline-none transition-colors"
                    style={{ backgroundColor: "rgba(255,255,255,0.7)", border: "1px solid rgba(229,231,235,0.8)", color: "#374151" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(229,231,235,0.8)")}
                  />
                </div>

                <p className="mb-2 text-[10px] uppercase tracking-wider" style={{ color: "#9CA3AF" }}>
                  {results.length} {results.length === 1 ? "expediente encontrado" : "expedientes encontrados"}
                </p>

                <div className="space-y-2">
                  {results.length > 0 ? (
                    results.map(({ exp, match }, i) => (
                      <ExpedienteResult
                        key={exp.codigo ?? i}
                        exp={exp}
                        match={match}
                        selected={selected?.codigo === exp.codigo}
                        onSelect={() => handleSelect(exp)}
                        delay={Math.min(i * 0.04, 0.3)}
                      />
                    ))
                  ) : (
                    <div className="rounded-xl px-4 py-10 text-center" style={{ backgroundColor: "rgba(255,255,255,0.5)", border: "1px solid rgba(229,231,235,0.8)" }}>
                      <AlertCircle size={20} className="mx-auto mb-2" style={{ color: "#D1D5DB" }} />
                      <p className="text-[12px]" style={{ color: "#6B7280" }}>
                        No se encontraron expedientes que coincidan con la búsqueda.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* FOOTER */}
            <div className="px-6 py-4" style={{ borderTop: "1px solid rgba(229,231,235,0.6)", backgroundColor: "rgba(255,255,255,0.4)" }}>
              {assignError && (
                <p className="mb-2 flex items-center gap-1.5 text-[12px]" style={{ color: "#B91C1C" }}>
                  <AlertCircle size={13} />
                  {assignError}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Resumen documento → expediente */}
                <div className="flex min-w-0 items-center gap-2 text-[11px]" style={{ color: "#6B7280" }}>
                  <span className="font-mono truncate" style={{ color: "#374151" }}>{documento.archivo}</span>
                  <ArrowRight size={13} style={{ color: "#9CA3AF" }} className="shrink-0" />
                  {selected ? (
                    <span className="truncate">
                      <span className="font-mono" style={{ color: "#374151" }}>{selected.codigo}</span>
                      <span style={{ color: "#9CA3AF" }}> · {selected.cliente}</span>
                    </span>
                  ) : (
                    <span className="italic" style={{ color: "#D1D5DB" }}>ninguno seleccionado</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {onIrAlExpediente && assigned && (
                    <motion.button
                      type="button"
                      onClick={() => onIrAlExpediente(selected)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-medium transition-colors"
                      style={{ border: "1px solid rgba(229,231,235,0.9)", color: "#374151", backgroundColor: "rgba(255,255,255,0.7)" }}
                    >
                      <BadgeCheck size={13} />
                      Ir al expediente
                    </motion.button>
                  )}

                  <button
                    type="button"
                    onClick={handleOverlayClose}
                    className="rounded-full px-4 py-2 text-[12px] font-medium transition-colors"
                    style={{ border: "1px solid rgba(229,231,235,0.9)", color: "#374151", backgroundColor: "rgba(255,255,255,0.6)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#D1D5DB")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(229,231,235,0.9)")}
                  >
                    Cancelar
                  </button>

                  <motion.button
                    type="button"
                    onClick={handleAssign}
                    disabled={assignDisabled && !assigned}
                    whileHover={!assignDisabled && !assigned ? { scale: 1.02 } : undefined}
                    whileTap={!assignDisabled && !assigned ? { scale: 0.98 } : undefined}
                    className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-medium text-white"
                    style={{
                      backgroundColor: assigned ? SUCCESS : assignDisabled ? "#E5E7EB" : ACCENT,
                      color: assignDisabled && !assigned ? "#9CA3AF" : "#FFFFFF",
                      cursor: assignDisabled && !assigned ? "not-allowed" : "pointer",
                    }}
                    onMouseEnter={(e) => {
                      if (!assignDisabled && !assigned) e.currentTarget.style.backgroundColor = ACCENT_HOVER;
                    }}
                    onMouseLeave={(e) => {
                      if (!assignDisabled && !assigned) e.currentTarget.style.backgroundColor = ACCENT;
                    }}
                  >
                    {assigned ? (
                      <>
                        <Check size={13} strokeWidth={3} />
                        Asignado
                      </>
                    ) : isAssigning ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        Asignando…
                      </>
                    ) : (
                      <>
                        <Link2 size={13} />
                        Asignar documento
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* SUB-VISOR: preview ampliada */}
          <AnimatePresence>
            {previewExpandido && (
              <motion.div
                className="fixed inset-0 z-[60] flex items-center justify-center p-6"
                style={{ backgroundColor: "rgba(17,24,39,0.55)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewExpandido(false);
                }}
              >
                <motion.div
                  className="relative overflow-hidden rounded-2xl bg-white"
                  style={{ width: "min(560px, 90vw)", height: "min(740px, 80vh)", boxShadow: "0 20px 60px rgba(17,24,39,0.3)" }}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.25, ease: EASE_OUT }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setPreviewExpandido(false)}
                    className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: "rgba(17,24,39,0.6)" }}
                    aria-label="Cerrar vista previa"
                  >
                    <X size={16} />
                  </button>
                  <DocumentPreview doc={documento} size="large" />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// =============================================================================
// EJEMPLO_USO — cómo el host (P6) monta el modal. No se ejecuta aquí.
// -----------------------------------------------------------------------------
// El modal NO navega ni persiste: el host conecta router/store/backend en los
// callbacks. DocumentPreview renderiza archivoUrl + mimeType reales en cuanto
// existan (img/iframe); sin archivoUrl muestra el placeholder faux.
//
// <AssignOrphanModal
//   isOpen={isAssignOpen}
//   documento={selectedOrphan}        // documento huérfano seleccionado en P6
//   expedientes={expedientes}         // lista de expedientes existentes
//   onClose={() => setIsAssignOpen(false)}
//   onAssign={async (doc, exp) => {
//     // CONTRATO — el host debe, al asignar:
//     //  • cambiar estado del huérfano a "asignado";
//     //  • historial del expediente: evento "asignacion_desde_huerfano"
//     //      `Documento ${doc.archivo} asignado desde Cola de Huérfanos al
//     //       expediente ${exp.codigo}` (timestamp + usuario actual);
//     //  • checklist: si doc.tipoDetectado ∈ {INE,CURP,CSF,Comprobante} → "recibido";
//     //  • next steps: quitar "falta X", agregar "Documento recibido, pendiente de
//     //      validar"; si todos recibidos → "Listo para validación final".
//     await api.asignarHuerfano(doc.id, exp.codigo); // throw → el modal muestra error
//   }}
//   onAssigned={(doc, exp) => { /* host: refrescar lista de huérfanos en P6 */ }}
//   onIrAlExpediente={(exp) => { /* host: navegar a P5 (router); si no se pasa, se oculta el botón) */ }}
// />
// =============================================================================
