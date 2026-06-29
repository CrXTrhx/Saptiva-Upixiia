"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Pencil, AlertTriangle, Plus, Trash2 } from "lucide-react";
import type { Operacion, TipoOperacion } from "@/lib/types";
import { TIPO_OPERACION_ICONO } from "@/lib/operacion-iconos";
import { TIPO_OPERACION_LABELS } from "@/lib/reglas-negocio";
import {
  validateForm,
  validateClienteField,
  NUEVA_OPERACION,
  type NuevaVentaFormValues,
  type OperacionFormValue,
  type FieldErrors,
  type OperacionErrors,
  type ClienteField,
} from "@/lib/schemas/nueva-venta";

// =============================================================================
// Modal Editar datos del cliente (P5)
// -----------------------------------------------------------------------------
// Integrado en P5. No llama APIs: valida con el schema existente (nueva-venta) y
// devuelve los datos a P5 vía onConfirm. P5 actualiza el expediente y registra el
// evento en el historial.
// =============================================================================

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

export type EditarDatosValues = {
  clienteNombre: string;
  clienteTelefono: string;
  clienteCorreo: string;
  clienteRfc?: string;
  operaciones: Operacion[];
};

type EditarDatosModalProps = {
  expediente: {
    codigo: string;
    clienteNombre: string;
    clienteTelefono: string;
    clienteCorreo: string;
    clienteRfc?: string;
    operaciones: Operacion[];
  };
  onConfirm: (datos: EditarDatosValues) => void;
  onClose: () => void;
  loading?: boolean;
};

// Tipos seleccionables en el modal (mismo orden que el alta de venta).
const TIPOS_OPERACION: TipoOperacion[] = ["ARMORING", "VEHICLE_SALE"];

function opsToForm(operaciones: Operacion[]): OperacionFormValue[] {
  if (!operaciones || operaciones.length === 0) return [{ ...NUEVA_OPERACION }];
  return operaciones.map((o) => ({
    tipo: o.tipo,
    monto: String(o.monto),
  }));
}

export default function EditarDatosModal({
  expediente,
  onConfirm,
  onClose,
  loading = false,
}: EditarDatosModalProps) {
  const [values, setValues] = useState<NuevaVentaFormValues>(() => ({
    clienteNombre: expediente.clienteNombre ?? "",
    clienteTelefono: expediente.clienteTelefono ?? "",
    clienteCorreo: expediente.clienteCorreo ?? "",
    clienteRfc: expediente.clienteRfc ?? "",
    operaciones: opsToForm(expediente.operaciones),
  }));
  const [touched, setTouched] = useState<Partial<Record<ClienteField, true>>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [opErrors, setOpErrors] = useState<OperacionErrors[]>([]);
  const [opTouched, setOpTouched] = useState<boolean[]>([]);

  const validation = useMemo(() => validateForm(values), [values]);
  const isValid = validation.success;

  const total = useMemo(
    () =>
      values.operaciones.reduce((acc, o) => {
        const n = parseFloat(o.monto.replace(/,/g, ""));
        return acc + (isNaN(n) ? 0 : n);
      }, 0),
    [values.operaciones],
  );

  function handleChange(field: ClienteField, raw: string) {
    const v = field === "clienteRfc" ? raw.toUpperCase() : raw;
    const next = { ...values, [field]: v };
    setValues(next);
    if (touched[field]) {
      const err = validateClienteField(field, v, next);
      setErrors((prev) => {
        const copy = { ...prev };
        if (err) copy[field] = err;
        else delete copy[field];
        return copy;
      });
    }
  }

  function handleBlur(field: ClienteField) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const err = validateClienteField(field, values[field], values);
    setErrors((prev) => {
      const copy = { ...prev };
      if (err) copy[field] = err;
      else delete copy[field];
      return copy;
    });
  }

  function fieldErr(f: ClienteField) {
    return touched[f] ? errors[f] : undefined;
  }

  function revalidarOps(next: NuevaVentaFormValues, tocadas: boolean[]) {
    const result = validateForm(next);
    const lineErrs = result.success ? [] : result.lineErrors;
    setOpErrors(
      next.operaciones.map((_, i) => (tocadas[i] ? lineErrs[i] ?? {} : {})),
    );
  }

  function updateOp(index: number, field: keyof OperacionFormValue, raw: string) {
    const v = field === "monto" ? raw.replace(/[^\d.]/g, "") : raw;
    const operaciones = values.operaciones.map((o, i) =>
      i === index ? { ...o, [field]: v } : o,
    );
    const next = { ...values, operaciones };
    setValues(next);
    revalidarOps(next, opTouched);
  }

  function blurOp(index: number) {
    const tocadas = [...opTouched];
    tocadas[index] = true;
    setOpTouched(tocadas);
    revalidarOps(values, tocadas);
  }

  function addOp() {
    setValues((prev) => ({
      ...prev,
      operaciones: [...prev.operaciones, { ...NUEVA_OPERACION }],
    }));
    setOpErrors((prev) => [...prev, {}]);
    setOpTouched((prev) => [...prev, false]);
  }

  function removeOp(index: number) {
    if (values.operaciones.length <= 1) return;
    setValues((prev) => ({
      ...prev,
      operaciones: prev.operaciones.filter((_, i) => i !== index),
    }));
    setOpErrors((prev) => prev.filter((_, i) => i !== index));
    setOpTouched((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit() {
    if (loading) return;
    setTouched({
      clienteNombre: true,
      clienteTelefono: true,
      clienteCorreo: true,
      clienteRfc: true,
    });
    setOpTouched(values.operaciones.map(() => true));

    const result = validateForm(values);
    if (!result.success) {
      setErrors(result.clientErrors);
      setOpErrors(values.operaciones.map((_, i) => result.lineErrors[i] ?? {}));
      return;
    }
    onConfirm({
      clienteNombre: result.data.clienteNombre,
      clienteTelefono: result.data.clienteTelefono,
      clienteCorreo: result.data.clienteCorreo,
      clienteRfc: result.data.clienteRfc,
      operaciones: result.data.operaciones,
    });
  }

  const inputBase =
    "w-full rounded-lg px-3 py-2.5 text-[13px] transition-colors";
  const inputStyle = (hasErr: boolean): React.CSSProperties => ({
    border: `1px solid ${hasErr ? "#D88A6A" : "#E5DED6"}`,
    color: "#302F2D",
    backgroundColor: "#FFFFFF",
    outline: "none",
  });

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
          className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white"
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
                <Pencil size={14} style={{ color: "#A86518" }} />
              </span>
              <div className="min-w-0">
                <h2 className="text-[16px] font-semibold" style={{ color: "#302F2D" }}>Editar datos del cliente</h2>
                <p className="mt-0.5 text-[12px]" style={{ color: "#989396" }}>
                  Actualiza la información del expediente{" "}
                  <span className="font-mono" style={{ color: "#B5AFA9" }}>{expediente.codigo}</span>.
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
            <div className="flex flex-col gap-4">
              <EditField label="Nombre del cliente" required error={fieldErr("clienteNombre")}>
                <input
                  type="text"
                  value={values.clienteNombre}
                  onChange={(e) => handleChange("clienteNombre", e.target.value)}
                  onBlur={() => handleBlur("clienteNombre")}
                  className={inputBase}
                  style={inputStyle(!!fieldErr("clienteNombre"))}
                  onFocus={(e) => { if (!fieldErr("clienteNombre")) e.currentTarget.style.borderColor = "#F19B42"; }}
                />
              </EditField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <EditField label="Teléfono" required error={fieldErr("clienteTelefono")}>
                  <input
                    type="tel"
                    value={values.clienteTelefono}
                    onChange={(e) => handleChange("clienteTelefono", e.target.value)}
                    onBlur={() => handleBlur("clienteTelefono")}
                    className={inputBase}
                    style={inputStyle(!!fieldErr("clienteTelefono"))}
                    onFocus={(e) => { if (!fieldErr("clienteTelefono")) e.currentTarget.style.borderColor = "#F19B42"; }}
                  />
                </EditField>
                <EditField label="Correo" required error={fieldErr("clienteCorreo")}>
                  <input
                    type="email"
                    value={values.clienteCorreo}
                    onChange={(e) => handleChange("clienteCorreo", e.target.value)}
                    onBlur={() => handleBlur("clienteCorreo")}
                    className={inputBase}
                    style={inputStyle(!!fieldErr("clienteCorreo"))}
                    onFocus={(e) => { if (!fieldErr("clienteCorreo")) e.currentTarget.style.borderColor = "#F19B42"; }}
                  />
                </EditField>
              </div>

              <EditField label="RFC" error={fieldErr("clienteRfc")} optional>
                <input
                  type="text"
                  value={values.clienteRfc}
                  onChange={(e) => handleChange("clienteRfc", e.target.value)}
                  onBlur={() => handleBlur("clienteRfc")}
                  maxLength={13}
                  className={`${inputBase} font-mono`}
                  style={inputStyle(!!fieldErr("clienteRfc"))}
                  onFocus={(e) => { if (!fieldErr("clienteRfc")) e.currentTarget.style.borderColor = "#F19B42"; }}
                />
              </EditField>

              {/* Operaciones */}
              <div className="flex flex-col gap-3 border-t pt-4" style={{ borderColor: "#F0EBE5" }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#5C5957" }}>
                    Operaciones de la venta<span style={{ color: "#F19B42" }}> *</span>
                  </span>
                  <button
                    type="button"
                    onClick={addOp}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
                    style={{ color: "#A86518" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#FCEEDB")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <Plus size={12} />
                    Agregar
                  </button>
                </div>

                {values.operaciones.map((op, i) => {
                  const err = opErrors[i] ?? {};
                  return (
                    <div key={i} className="rounded-xl p-3" style={{ border: "1px solid #E5DED6", backgroundColor: "#FAF6F1" }}>
                      {/* Encabezado */}
                      <div className="mb-2.5 flex items-center gap-2">
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-semibold tabular-nums"
                          style={{ backgroundColor: "#FCEEDB", color: "#A86518" }}
                        >
                          {i + 1}
                        </span>
                        <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "#989396" }}>
                          Operación
                        </span>
                        <button
                          type="button"
                          onClick={() => removeOp(i)}
                          disabled={values.operaciones.length <= 1}
                          aria-label="Quitar operación"
                          className="ml-auto rounded-md p-1.5 transition-colors disabled:cursor-not-allowed"
                          style={{ color: values.operaciones.length <= 1 ? "#E5DED6" : "#989396" }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-start gap-2">
                        {/* Tipo: selector segmentado con icono */}
                        <div className="min-w-[200px] flex-1">
                          <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Tipo de operación">
                            {TIPOS_OPERACION.map((value) => {
                              const Icon = TIPO_OPERACION_ICONO[value];
                              const selected = op.tipo === value;
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  role="radio"
                                  aria-checked={selected}
                                  onClick={() => {
                                    updateOp(i, "tipo", value);
                                    blurOp(i);
                                  }}
                                  className="flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] font-medium transition-colors"
                                  style={{
                                    border: `1px solid ${selected ? "#F19B42" : "#E5DED6"}`,
                                    backgroundColor: selected ? "#FCEEDB" : "#FFFFFF",
                                    color: selected ? "#A86518" : "#5C5957",
                                  }}
                                >
                                  <Icon size={14} strokeWidth={1.9} />
                                  {TIPO_OPERACION_LABELS[value]}
                                </button>
                              );
                            })}
                          </div>
                          {err.tipo && <p className="mt-1 text-[11px]" style={{ color: "#9C4B2E" }}>{err.tipo}</p>}
                        </div>

                        {/* Monto */}
                        <div className="w-32 shrink-0">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px]" style={{ color: "#B5AFA9" }}>$</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              aria-label="Monto de la operación"
                              value={op.monto}
                              onChange={(e) => updateOp(i, "monto", e.target.value)}
                              onBlur={() => blurOp(i)}
                              className={`${inputBase} pl-5 tabular-nums`}
                              style={inputStyle(!!err.monto)}
                            />
                          </div>
                          {err.monto && <p className="mt-1 text-[11px]" style={{ color: "#9C4B2E" }}>{err.monto}</p>}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: "#F0EBE5" }}>
                  <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#5C5957" }}>Total</span>
                  <span className="text-[14px] font-semibold tabular-nums" style={{ color: "#302F2D" }}>
                    ${total.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-4" style={{ borderTop: "1px solid #F0EBE5", backgroundColor: "#FAF6F1" }}>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-white px-4 py-2 text-[12px] font-medium transition-colors"
              style={{ border: "1px solid #E5DED6", color: "#5C5957" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#B5AFA9")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#E5DED6")}
            >
              Cancelar
            </button>
            <motion.button
              type="button"
              onClick={handleSubmit}
              disabled={!isValid || loading}
              whileHover={isValid && !loading ? { scale: 1.02 } : undefined}
              whileTap={isValid && !loading ? { scale: 0.98 } : undefined}
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[12px] font-medium text-white disabled:cursor-not-allowed"
              style={{ backgroundColor: isValid && !loading ? "#F19B42" : "#E7C9A0" }}
            >
              {loading ? "Guardando…" : "Guardar cambios"}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function EditField({
  label,
  required,
  optional,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "#5C5957" }}>
        {label}
        {required && <span style={{ color: "#F19B42" }}> *</span>}
        {optional && <span className="lowercase tracking-normal" style={{ color: "#B5AFA9" }}> (opcional)</span>}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-[11px]" style={{ color: "#9C4B2E" }}>
          <AlertTriangle size={11} />
          {error}
        </p>
      )}
    </div>
  );
}
