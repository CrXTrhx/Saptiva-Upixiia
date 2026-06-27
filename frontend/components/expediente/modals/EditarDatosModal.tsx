"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Pencil, AlertTriangle } from "lucide-react";
import type { TipoOperacion } from "@/lib/types";
import {
  validateForm,
  validateField,
  type NuevaVentaFormValues,
  type FieldErrors,
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
  montoEstimado: number;
  tipoOperacion: TipoOperacion;
};

type EditarDatosModalProps = {
  expediente: {
    codigo: string;
    clienteNombre: string;
    clienteTelefono: string;
    clienteCorreo: string;
    clienteRfc?: string;
    montoEstimado: number;
    tipoOperacion: TipoOperacion;
  };
  onConfirm: (datos: EditarDatosValues) => void;
  onClose: () => void;
  loading?: boolean;
};

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
    montoEstimado: expediente.montoEstimado != null ? String(expediente.montoEstimado) : "",
    tipoOperacion: expediente.tipoOperacion ?? "",
  }));
  const [touched, setTouched] = useState<Partial<Record<keyof NuevaVentaFormValues, true>>>({});
  const [errors, setErrors] = useState<FieldErrors>({});

  const validation = useMemo(() => validateForm(values), [values]);
  const isValid = validation.success;

  function handleChange(field: keyof NuevaVentaFormValues, raw: string) {
    const v = field === "clienteRfc" ? raw.toUpperCase() : raw;
    const cleaned = field === "montoEstimado" ? v.replace(/[^\d.]/g, "") : v;
    const next = { ...values, [field]: cleaned };
    setValues(next);
    if (touched[field]) {
      const err = validateField(field, cleaned, next);
      setErrors((prev) => {
        const copy = { ...prev };
        if (err) copy[field] = err;
        else delete copy[field];
        return copy;
      });
    }
  }

  function handleBlur(field: keyof NuevaVentaFormValues) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const err = validateField(field, values[field], values);
    setErrors((prev) => {
      const copy = { ...prev };
      if (err) copy[field] = err;
      else delete copy[field];
      return copy;
    });
  }

  function fieldErr(f: keyof NuevaVentaFormValues) {
    return touched[f] ? errors[f] : undefined;
  }

  function handleSubmit() {
    if (loading) return;
    const allTouched: Partial<Record<keyof NuevaVentaFormValues, true>> = {};
    for (const k of Object.keys(values) as (keyof NuevaVentaFormValues)[]) allTouched[k] = true;
    setTouched(allTouched);

    const result = validateForm(values);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    onConfirm(result.data as EditarDatosValues);
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <EditField label="Monto estimado" required error={fieldErr("montoEstimado")}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px]" style={{ color: "#B5AFA9" }}>$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={values.montoEstimado}
                      onChange={(e) => handleChange("montoEstimado", e.target.value)}
                      onBlur={() => handleBlur("montoEstimado")}
                      className={`${inputBase} pl-6 tabular-nums`}
                      style={inputStyle(!!fieldErr("montoEstimado"))}
                      onFocus={(e) => { if (!fieldErr("montoEstimado")) e.currentTarget.style.borderColor = "#F19B42"; }}
                    />
                  </div>
                </EditField>
              </div>

              <EditField label="Tipo de operación" required error={fieldErr("tipoOperacion")}>
                <select
                  value={values.tipoOperacion}
                  onChange={(e) => handleChange("tipoOperacion", e.target.value)}
                  onBlur={() => handleBlur("tipoOperacion")}
                  className={`${inputBase} cursor-pointer`}
                  style={inputStyle(!!fieldErr("tipoOperacion"))}
                >
                  <option value="" disabled>Seleccionar…</option>
                  <option value="ARMORING">Blindaje</option>
                  <option value="VEHICLE_SALE">Venta de vehículo</option>
                </select>
              </EditField>
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
