"use client";

// ═══════════════════════════════════════════════════════════════════════════
// P-Cliente — Detalle de Cliente (todos los expedientes de UN cliente)
// ---------------------------------------------------------------------------
// Módulo integrable: recibe TODO por props y comunica acciones por callbacks.
// NO navega por sí mismo (sin router/Link/window.location), NO hace fetch ni
// usa localStorage. El host (dashboard) conecta router/datos.
//
// Reemplaza al modal pequeño que hoy abre <ExpedientesClienteModal> al hacer
// clic en un cliente del dashboard en modo "Por cliente".
//
// NOTA DE ADAPTACIÓN: el contrato original venía con estados/operaciones en
// español ("en_captura", "blindaje") y campos (fecha/monto/next). Esta app usa
// los CÓDIGOS reales del backend (Estado / TipoOperacion) y los nombres de campo
// del tipo Expediente. Se adaptó al modelo real para que funcione y se vea igual
// al resto (misma paleta de statusColorMap que usan el dashboard y el modal).
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ChevronRight,
  Search,
  ChevronDown,
  Phone,
  Mail,
  CreditCard,
  Plus,
  AlertTriangle,
  FileText,
  X,
  CalendarX,
  Clock,
  Zap,
  CheckCircle2,
  Archive,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { Estado, Expediente, TipoOperacion } from "@/lib/types";
import { TIPO_OPERACION_LABEL } from "@/lib/types";
import { statusColorMap, STATUS_DISPLAY_ORDER } from "@/lib/status";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

// Paleta / acento Centur
const COLOR = {
  bg: "#F1EBE0",
  surface: "#FFFFFF",
  text: "#111827",
  text2: "#374151",
  muted: "#6B7280",
  muted2: "#9CA3AF",
  faint: "#D1D5DB",
  border: "#E5E7EB",
  borderInner: "#F3F4F6",
  hoverRow: "#FAFAF7",
  tableHead: "#F9FAFB",
  accent: "#F19B42",
  accentHover: "#E08930",
  danger: "#EF4444",
  dangerBg: "#FEE2E2",
  dangerText: "#B91C1C",
} as const;

// Config por estado: reusa colores/labels reales de statusColorMap (fuente de
// verdad compartida con el dashboard) + ícono y prioridad de orden.
const ESTADO_ICON: Record<Estado, LucideIcon> = {
  INCOMPLETE_EXPIRED: CalendarX,
  IN_VALIDATION: Clock,
  RECEIVING: Mail,
  CAPTURING: Zap,
  COMPLETE: CheckCircle2,
  CANCELLED: X,
  ARCHIVED: Archive,
};

function estadoCfg(estado: Estado) {
  const c = statusColorMap[estado];
  const priority = STATUS_DISPLAY_ORDER.indexOf(estado);
  return {
    label: c?.label ?? estado,
    dot: c?.dot ?? COLOR.muted2,
    bg: c?.bg ?? COLOR.borderInner,
    text: c?.text ?? COLOR.muted,
    Icon: ESTADO_ICON[estado] ?? FileText,
    // priority: vencidos primero (índice 0 → 1). Desconocidos al final.
    priority: priority === -1 ? 99 : priority + 1,
  };
}

const TERMINALES: Estado[] = ["COMPLETE", "CANCELLED", "ARCHIVED"];

// Cliente mínimo necesario; ClienteAgrupado del dashboard lo satisface.
export type ClienteLite = {
  id: string;
  nombre: string;
  telefono?: string;
  correo?: string;
  rfc?: string;
};

type Props = {
  cliente: ClienteLite | null | undefined; // requerido en uso normal
  expedientes: Expediente[] | null | undefined; // SOLO los de este cliente
  onBack: () => void; // host → vuelve a P2
  onAbrirExpediente: (exp: Expediente) => void; // host → navega a la P5 EXISTENTE
  onNuevaVenta?: (cliente: ClienteLite) => void; // host → navega a P3 existente
};

// ── helpers ────────────────────────────────────────────────────────────────

function initials(nombre?: string): string {
  if (!nombre || !nombre.trim()) return "—";
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function formatMoney(n: number | null | undefined): string {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(v);
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function primerNombre(nombre?: string): string {
  if (!nombre) return "este cliente";
  return nombre.trim().split(/\s+/)[0] || "este cliente";
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export default function ClienteDetalle({
  cliente,
  expedientes,
  onBack,
  onAbrirExpediente,
  onNuevaVenta,
}: Props) {
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState<"" | Estado>("");
  const [filterOperacion, setFilterOperacion] = useState<"" | TipoOperacion>("");
  // TODO conectar rango de fechas (filtro decorativo por ahora)

  const lista = useMemo<Expediente[]>(
    () => (Array.isArray(expedientes) ? expedientes : []),
    [expedientes],
  );

  // STATS sobre TODOS los expedientes del cliente (no los filtrados)
  const stats = useMemo(() => {
    const total = lista.length;
    const montoTotal = lista.reduce((s, e) => s + (e.montoEstimado ?? 0), 0);
    const distribucion = lista.reduce(
      (acc, e) => {
        acc[e.estado] = (acc[e.estado] ?? 0) + 1;
        return acc;
      },
      {} as Partial<Record<Estado, number>>,
    );
    const activos = lista.filter((e) => !TERMINALES.includes(e.estado)).length;
    const urgentes = lista.filter(
      (e) => e.estado === "INCOMPLETE_EXPIRED",
    ).length;
    return { total, montoTotal, distribucion, activos, urgentes };
  }, [lista]);

  // FILTRADOS: estado + operación + búsqueda; ordenados por prioridad de estado
  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = lista.filter((e) => {
      if (filterEstado && e.estado !== filterEstado) return false;
      if (filterOperacion && e.tipoOperacion !== filterOperacion) return false;
      if (q) {
        const haystack = [e.codigo, e.nextStepPrioritario, e.capturista]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return out.sort((a, b) => estadoCfg(a.estado).priority - estadoCfg(b.estado).priority);
  }, [lista, search, filterEstado, filterOperacion]);

  const hasFilters = !!(search.trim() || filterEstado || filterOperacion);

  function limpiarFiltros() {
    setSearch("");
    setFilterEstado("");
    setFilterOperacion("");
  }

  // Opciones de "Estado": solo los estados que ESTE cliente tiene, por prioridad
  const estadoOptions = useMemo(() => {
    const presentes = (Object.keys(stats.distribucion) as Estado[]).sort(
      (a, b) => estadoCfg(a).priority - estadoCfg(b).priority,
    );
    return [
      { value: "", label: "Todos los estados" },
      ...presentes.map((e) => ({ value: e, label: estadoCfg(e).label })),
    ];
  }, [stats.distribucion]);

  const operacionOptions = [
    { value: "", label: "Todas las operaciones" },
    { value: "ARMORING", label: "Blindaje" },
    { value: "VEHICLE_SALE", label: "Venta de vehículo" },
  ];

  // Estado vacío / sin cliente
  const sinDatos = !cliente || lista.length === 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLOR.bg, color: COLOR.text }}>
      {/* 1. HEADER */}
      <header
        className="sticky top-0 z-20"
        style={{ backgroundColor: COLOR.surface, borderBottom: `1px solid ${COLOR.border}` }}
      >
        <div className="mx-auto max-w-[1400px] px-10 py-4">
          {/* Fila 1: breadcrumb + CTA */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-[13px]">
              <button
                type="button"
                onClick={onBack}
                aria-label="Volver al dashboard"
                className="transition-colors cursor-pointer"
                style={{ color: COLOR.muted2 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = COLOR.text)}
                onMouseLeave={(e) => (e.currentTarget.style.color = COLOR.muted2)}
              >
                <ArrowLeft size={16} />
              </button>
              <button
                type="button"
                onClick={onBack}
                className="cursor-pointer transition-colors"
                style={{ color: COLOR.muted }}
                onMouseEnter={(e) => (e.currentTarget.style.color = COLOR.text)}
                onMouseLeave={(e) => (e.currentTarget.style.color = COLOR.muted)}
              >
                Dashboard
              </button>
              <ChevronRight size={14} style={{ color: COLOR.faint }} />
              <span className="font-medium" style={{ color: COLOR.text }}>
                {cliente?.nombre ?? "—"}
              </span>
            </div>

            {onNuevaVenta && cliente && (
              <button
                type="button"
                onClick={() => onNuevaVenta(cliente)}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium text-white transition-colors cursor-pointer"
                style={{ backgroundColor: COLOR.accent }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = COLOR.accentHover)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = COLOR.accent)}
              >
                <Plus size={14} />
                Nueva venta
              </button>
            )}
          </div>

          {/* Fila 2: identidad */}
          <div className="flex items-center gap-4">
            <span
              className="grid place-items-center rounded-full font-semibold shrink-0"
              style={{
                height: 52,
                width: 52,
                fontSize: 16,
                ...(stats.urgentes > 0
                  ? { backgroundColor: COLOR.dangerBg, color: COLOR.dangerText, border: `2px solid ${COLOR.danger}` }
                  : { backgroundColor: COLOR.borderInner, color: COLOR.text2, border: `1px solid ${COLOR.border}` }),
              }}
              aria-hidden="true"
            >
              {initials(cliente?.nombre)}
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight truncate" style={{ color: COLOR.text }}>
                  {cliente?.nombre ?? "—"}
                </h1>
                {stats.urgentes > 0 && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                    style={{ backgroundColor: COLOR.dangerBg, color: COLOR.dangerText }}
                  >
                    <AlertTriangle size={10} />
                    {stats.urgentes} {stats.urgentes === 1 ? "urgente" : "urgentes"}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-4 text-[12px]" style={{ color: COLOR.muted }}>
                <span className="inline-flex items-center gap-1.5">
                  <Phone size={12} />
                  {cliente?.telefono || "—"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Mail size={12} />
                  {cliente?.correo || "—"}
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono">
                  <CreditCard size={12} />
                  {cliente?.rfc || "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-10 py-7">
        {!cliente ? (
          <EmptyBlock texto="No hay datos del cliente para mostrar." />
        ) : (
          <>
            {/* 2. MINI STATS */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              <StatCard label="Expedientes totales" value={stats.total} icon={FileText} color={COLOR.muted} delay={0} />
              <StatCard label="Activos" value={stats.activos} icon={Zap} color="#3B82F6" delay={0.05} />
              <StatCard
                label="Monto acumulado"
                value={formatMoney(stats.montoTotal)}
                icon={TrendingUp}
                color="#10B981"
                delay={0.1}
                small
              />
              <StatCard
                label="Urgentes"
                value={stats.urgentes}
                icon={AlertTriangle}
                color={stats.urgentes > 0 ? COLOR.danger : COLOR.muted2}
                delay={0.15}
              />
            </div>

            {/* 3. DISTRIBUCIÓN POR ESTADO */}
            {stats.total > 0 && (
              <div className="flex items-center gap-2 mb-6 flex-wrap">
                <span className="text-[11px] uppercase tracking-wider" style={{ color: COLOR.muted2 }}>
                  Distribución:
                </span>
                {(Object.keys(stats.distribucion) as Estado[])
                  .sort((a, b) => estadoCfg(a).priority - estadoCfg(b).priority)
                  .map((estado) => {
                    const c = estadoCfg(estado);
                    const activo = filterEstado === estado;
                    return (
                      <button
                        key={estado}
                        type="button"
                        onClick={() => setFilterEstado(activo ? "" : estado)}
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium cursor-pointer transition-shadow"
                        style={{
                          backgroundColor: c.bg,
                          color: c.text,
                          boxShadow: activo ? `0 0 0 2px ${c.dot}` : "none",
                        }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
                        {stats.distribucion[estado]} {c.label}
                      </button>
                    );
                  })}
              </div>
            )}

            {/* 4. ACTION BAR */}
            <div className="flex gap-3 mb-2 flex-wrap">
              <div className="relative flex-1 min-w-[280px]">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: COLOR.muted2 }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Buscar en expedientes de ${primerNombre(cliente.nombre)} (código, next step, capturista)`}
                  className="w-full pl-10 pr-4 py-2.5 text-[13px] rounded-full outline-none transition-colors"
                  style={{ backgroundColor: COLOR.surface, border: `1px solid ${COLOR.border}` }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = COLOR.accent)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = COLOR.border)}
                />
              </div>

              <FilterDropdown
                label="Estado"
                value={filterEstado}
                options={estadoOptions}
                onSelect={(v) => setFilterEstado(v as "" | Estado)}
              />
              <FilterDropdown
                label="Operación"
                value={filterOperacion}
                options={operacionOptions}
                onSelect={(v) => setFilterOperacion(v as "" | TipoOperacion)}
              />

              {/* Fecha: decorativo. TODO conectar rango de fechas */}
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] cursor-default"
                style={{ backgroundColor: COLOR.surface, border: `1px solid ${COLOR.border}`, color: COLOR.muted }}
                title="Próximamente"
              >
                Fecha
                <ChevronDown size={14} style={{ color: COLOR.muted2 }} />
              </button>
            </div>

            {/* 5. LÍNEA DE RESULTADOS */}
            <div className="flex items-center justify-between mb-3 mt-3">
              <span className="text-[12px]" style={{ color: COLOR.muted }}>
                {filtrados.length} de {stats.total} expedientes
                {hasFilters ? " (filtrado)" : ""}
              </span>
              {hasFilters && (
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="text-[11px] cursor-pointer transition-colors"
                  style={{ color: COLOR.muted2 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = COLOR.text)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = COLOR.muted2)}
                >
                  ✕ Limpiar filtros
                </button>
              )}
            </div>

            {/* 6. TABLA */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: COLOR.surface, border: `1px solid ${COLOR.border}` }}
            >
              {/* Header columnas */}
              <div
                className="grid px-6 py-3.5 text-[10px] uppercase tracking-wider"
                style={{
                  gridTemplateColumns: "170px 120px 1fr 130px 130px 1.4fr",
                  gap: 16,
                  color: COLOR.muted2,
                  backgroundColor: COLOR.tableHead,
                  borderBottom: `1px solid ${COLOR.border}`,
                }}
              >
                <div>Código</div>
                <div>Fecha</div>
                <div>Operación</div>
                <div>Monto</div>
                <div>Estado</div>
                <div>Siguiente paso</div>
              </div>

              {filtrados.length === 0 ? (
                <div className="px-5 py-16 text-center flex flex-col items-center gap-3">
                  <FileText size={26} style={{ color: COLOR.faint }} />
                  <p className="text-[13px]" style={{ color: COLOR.muted2 }}>
                    {sinDatos
                      ? "Este cliente no tiene expedientes todavía."
                      : "No hay expedientes de este cliente que coincidan con los filtros."}
                  </p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {filtrados.map((exp, i) => {
                    const c = estadoCfg(exp.estado);
                    const vencido = exp.estado === "INCOMPLETE_EXPIRED";
                    return (
                      <motion.div
                        key={exp.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.25, delay: i * 0.03, ease: EASE_OUT }}
                        role="link"
                        tabIndex={0}
                        aria-label={`Ver expediente ${exp.codigo ?? ""}`}
                        onClick={() => onAbrirExpediente(exp)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onAbrirExpediente(exp);
                          }
                        }}
                        className="relative grid items-center cursor-pointer transition-colors"
                        style={{
                          gridTemplateColumns: "170px 120px 1fr 130px 130px 1.4fr",
                          gap: 16,
                          padding: "16px 24px",
                          borderBottom: i === filtrados.length - 1 ? "none" : `1px solid ${COLOR.borderInner}`,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = COLOR.hoverRow)}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        {vencido && (
                          <span
                            className="absolute left-0 top-0 bottom-0"
                            style={{ width: 3, backgroundColor: COLOR.danger }}
                            aria-hidden="true"
                          />
                        )}
                        <div className="flex items-center gap-1.5 min-w-0">
                          {vencido && <AlertTriangle size={12} style={{ color: COLOR.danger }} className="shrink-0" />}
                          <span className="font-mono tabular-nums text-[13px] truncate" style={{ color: COLOR.muted }}>
                            {exp.codigo || "—"}
                          </span>
                        </div>
                        <div className="text-[13px] tabular-nums" style={{ color: COLOR.muted }}>
                          {formatDate(exp.fechaCreacion)}
                        </div>
                        <div className="text-[13px] truncate" style={{ color: COLOR.text2 }}>
                          {TIPO_OPERACION_LABEL[exp.tipoOperacion] ?? "—"}
                        </div>
                        <div className="text-[13px] font-medium tabular-nums" style={{ color: COLOR.text }}>
                          {formatMoney(exp.montoEstimado)}
                        </div>
                        <div>
                          <Badge estado={exp.estado} small />
                        </div>
                        <div className="text-[13px] truncate" style={{ color: COLOR.text2 }}>
                          {exp.nextStepPrioritario || "—"}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTES
// ═══════════════════════════════════════════════════════════════════════════

function Badge({ estado, small }: { estado: Estado; small?: boolean }) {
  const c = estadoCfg(estado);
  const Icon = c.Icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap"
      style={{
        backgroundColor: c.bg,
        color: c.text,
        padding: small ? "2px 8px" : "4px 10px",
        fontSize: small ? 11 : 12,
      }}
    >
      <span className="rounded-full shrink-0" style={{ height: 6, width: 6, backgroundColor: c.dot }} />
      {c.label}
      <Icon size={small ? 11 : 12} aria-hidden="true" />
    </span>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  delay,
  small,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  delay: number;
  small?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: EASE_OUT }}
      className="p-4 rounded-2xl"
      style={{ backgroundColor: COLOR.surface, border: `1px solid ${COLOR.border}` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px]" style={{ color: COLOR.muted }}>
          {label}
        </span>
        <Icon size={14} style={{ color }} />
      </div>
      <div
        className="font-medium tabular-nums mt-2"
        style={{ fontSize: small ? 20 : 28, color: COLOR.text, lineHeight: 1.1 }}
      >
        {value}
      </div>
    </motion.div>
  );
}

type Option = { value: string; label: string };

function FilterDropdown({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: Option[];
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = !!value;
  const current = options.find((o) => o.value === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] cursor-pointer transition-colors"
        style={{
          backgroundColor: COLOR.surface,
          border: `1px solid ${active ? COLOR.accent : COLOR.border}`,
          color: active ? COLOR.text : COLOR.muted,
        }}
      >
        {active ? current?.label ?? label : label}
        <ChevronDown
          size={14}
          style={{ color: COLOR.muted2, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* overlay invisible para cerrar al click fuera */}
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="absolute left-0 top-full mt-2 z-40 min-w-[200px] rounded-xl overflow-hidden"
              style={{
                backgroundColor: COLOR.surface,
                border: `1px solid ${COLOR.border}`,
                boxShadow: "0 8px 24px rgba(17,24,39,0.10)",
              }}
            >
              {options.map((opt) => {
                const sel = opt.value === value;
                return (
                  <button
                    key={opt.value || "__all__"}
                    type="button"
                    onClick={() => {
                      onSelect(opt.value);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[13px] transition-colors"
                    style={{ color: sel ? COLOR.text : COLOR.text2 }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = COLOR.hoverRow)}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    {opt.label}
                    {sel && <span style={{ color: COLOR.accent }}>✓</span>}
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

function EmptyBlock({ texto }: { texto: string }) {
  return (
    <div
      className="rounded-2xl px-5 py-16 text-center flex flex-col items-center gap-3"
      style={{ backgroundColor: COLOR.surface, border: `1px solid ${COLOR.border}` }}
    >
      <FileText size={26} style={{ color: COLOR.faint }} />
      <p className="text-[13px]" style={{ color: COLOR.muted2 }}>
        {texto}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EJEMPLO_USO — cómo el host (dashboard) lo monta. Datos por props, acciones por
// callbacks. El componente NO navega solo.
//
//   import { useRouter } from "next/navigation";
//   import ClienteDetalle from "@/components/dashboard/ClienteDetalle";
//
//   const router = useRouter();
//
//   <ClienteDetalle
//     cliente={clienteAgrupado}                         // {id,nombre,telefono,correo,rfc,...}
//     expedientes={clienteAgrupado.expedientes}         // SOLO los de ese cliente
//     onBack={() => setSelectedCliente(null)}           // host: volver a P2
//     onAbrirExpediente={(exp) => router.push(`/expedientes/${exp.id}`)} // P5 EXISTENTE
//     onNuevaVenta={(cli) => router.push("/nueva-venta")}                // P3 existente
//   />
//
// ── NOTA CONEXIÓN P2 (dashboard) ────────────────────────────────────────────
// En app/dashboard/page.tsx, el clic en un cliente HOY hace setSelectedCliente
// (que abre <ExpedientesClienteModal>). El cambio puntual: cuando hay un cliente
// seleccionado, renderizar <ClienteDetalle> a pantalla completa EN LUGAR del
// modal. No se toca la tabla, los filtros ni el toggle "Por cliente/prioridad":
// solo qué se muestra al seleccionar. onVerCliente(cliente) = setSelectedCliente.
// ═══════════════════════════════════════════════════════════════════════════
