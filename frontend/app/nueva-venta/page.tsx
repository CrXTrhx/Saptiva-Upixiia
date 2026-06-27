"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  Loader2,
  Sparkles,
  Lock,
  Check,
  X,
  UserCheck,
} from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { expedientesService } from "@/services/expedientesService";
import {
  peekNuevaVentaPrefill,
  clearNuevaVentaPrefill,
} from "@/lib/nueva-venta-handoff";
import {
  validateForm,
  validateField,
  INITIAL_VALUES,
  type NuevaVentaFormValues,
  type FieldErrors,
} from "@/lib/schemas/nueva-venta";
import {
  requiereIdentificacion,
  UMBRALES_IDENTIFICACION,
  TIPO_OPERACION_LABELS,
} from "@/lib/reglas-negocio";
import type { RfcSugerencia, TipoOperacion } from "@/lib/types";

// El RFC es obligatorio en este formulario (identidad del cliente).
const VALIDATE_OPTS = { rfcRequired: true } as const;

// --- Reusable Field ---

function Field({
  label,
  required = false,
  error,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]"
      >
        {label}
        {required && (
          <span className="text-[var(--color-accent)] ml-0.5">*</span>
        )}
        {!required && (
          <span className="text-[var(--color-tertiary)] lowercase ml-1 tracking-normal">
            (opcional)
          </span>
        )}
      </label>
      {children}
      {error && (
        <p id={errorId} className="text-xs text-[var(--color-error)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const inputBase =
  "w-full rounded-lg border bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-tertiary)] transition-colors focus:outline-none focus:ring-2 hover:border-[var(--color-muted)]";
const inputNormal = `${inputBase} border-[var(--color-border)] focus:border-[var(--color-accent)] focus:ring-[var(--color-accent-ring)]`;
const inputError = `${inputBase} border-[var(--color-error)] focus:border-[var(--color-error)] focus:ring-[var(--color-error)]/15`;

const lockedStyle: React.CSSProperties = {
  backgroundColor: "var(--color-bg)",
  color: "var(--color-muted)",
  cursor: "not-allowed",
};

function inputClass(hasError: boolean) {
  return hasError ? inputError : inputNormal;
}

// --- Roadmap ---

const ROADMAP_STEPS = [
  "Nueva venta",
  "Captura de documentos",
  "Recepción",
  "Validación",
  "Expediente completo",
];

function Roadmap() {
  return (
    <div className="flex flex-col gap-0">
      {ROADMAP_STEPS.map((step, i) => {
        const active = i === 0;
        return (
          <div key={step} className="flex items-start gap-2.5">
            <div className="flex flex-col items-center">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold shrink-0 ${
                  active
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-[var(--color-border-inner)] text-[var(--color-tertiary)]"
                }`}
              >
                {i + 1}
              </span>
              {i < ROADMAP_STEPS.length - 1 && (
                <span className="w-px h-3 bg-[var(--color-border)]" />
              )}
            </div>
            <span
              className={`text-xs leading-4 ${
                active
                  ? "font-medium text-[var(--color-text)]"
                  : "text-[var(--color-muted)]"
              }`}
            >
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// --- Form status ---

type FormStatus = "idle" | "submitting" | "success" | "error";

// --- Page ---

export default function NuevaVentaPage() {
  return (
    <ProtectedRoute>
      <NuevaVentaContent />
    </ProtectedRoute>
  );
}

function NuevaVentaContent() {
  const router = useRouter();

  // Prefill: desde la Cola de Huérfanos (documentoOrigen) o desde un cliente
  // existente (clienteLock = datos del cliente precargados y bloqueados).
  const prefill = useMemo(() => peekNuevaVentaPrefill(), []);
  const documentoOrigen = prefill?.documentoOrigen ?? null;
  const returnTo = prefill?.returnTo ?? "/dashboard";
  const lockedFields = useMemo(() => new Set(prefill?.lockedFields ?? []), [prefill]);
  const modoCliente = !!prefill?.clienteLock;

  useEffect(() => {
    clearNuevaVentaPrefill();
  }, []);

  const [values, setValues] = useState<NuevaVentaFormValues>(() =>
    prefill
      ? {
          clienteNombre: prefill.nombreCliente || "",
          clienteTelefono: prefill.telefono || "",
          clienteCorreo: prefill.correo || "",
          clienteRfc: prefill.rfc || "",
          montoEstimado: prefill.montoEstimado || "",
          tipoOperacion: prefill.tipoOperacion || "",
        }
      : INITIAL_VALUES,
  );
  const [touched, setTouched] = useState<
    Partial<Record<keyof NuevaVentaFormValues, true>>
  >({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<FormStatus>("idle");
  const [serverError, setServerError] = useState<string | null>(null);

  // Cliente existente al que se asociará la venta (por RFC). En modo cliente viene
  // ya fijado; en modo normal se fija al elegir/coincidir una sugerencia.
  const [asociado, setAsociado] = useState<RfcSugerencia | null>(
    modoCliente && prefill
      ? {
          rfc: prefill.rfc,
          nombre: prefill.nombreCliente,
          telefono: prefill.telefono,
          correo: prefill.correo,
        }
      : null,
  );
  // Un campo está bloqueado si viene de lockedFields (main) O hay un cliente asociado.
  const clienteBloqueado = modoCliente || !!asociado;
  function isLocked(field: string) {
    return clienteBloqueado || lockedFields.has(field);
  }

  // Autocompletado de RFC
  const [sugerencias, setSugerencias] = useState<RfcSugerencia[]>([]);
  const [rfcFocus, setRfcFocus] = useState(false);

  const codigoPreview = useMemo(
    () =>
      expedientesService.previewNextCodigo(
        values.tipoOperacion as TipoOperacion | "",
      ),
    [values.tipoOperacion],
  );

  const validation = useMemo(
    () => validateForm(values, VALIDATE_OPTS),
    [values],
  );
  const isValid = validation.success;

  // Asocia la venta a un cliente existente: precarga y bloquea sus datos.
  const asociarCliente = useCallback((sug: RfcSugerencia) => {
    setAsociado(sug);
    setSugerencias([]);
    setRfcFocus(false);
    setValues((prev) => ({
      ...prev,
      clienteRfc: sug.rfc.toUpperCase(),
      clienteNombre: sug.nombre,
      clienteTelefono: sug.telefono,
      clienteCorreo: sug.correo,
    }));
    setErrors({});
  }, []);

  // Quita la asociación (modo normal) para capturar un cliente nuevo.
  const quitarAsociacion = useCallback(() => {
    setAsociado(null);
    setSugerencias([]);
    setValues((prev) => ({
      ...prev,
      clienteRfc: "",
      clienteNombre: "",
      clienteTelefono: "",
      clienteCorreo: "",
    }));
    setErrors({});
    setTouched({});
  }, []);

  // Busca sugerencias mientras se escribe el RFC (debounce). Si lo escrito coincide
  // EXACTAMENTE con un cliente existente, se asocia automáticamente.
  useEffect(() => {
    if (clienteBloqueado) {
      setSugerencias([]);
      return;
    }
    const rfc = values.clienteRfc.trim();
    if (rfc.length < 2) {
      setSugerencias([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      expedientesService.getSugerenciasRfc(rfc).then((res) => {
        if (cancelled) return;
        const exact = res.find(
          (s) => s.rfc.toUpperCase() === rfc.toUpperCase(),
        );
        if (exact && rfc.length >= 12) {
          asociarCliente(exact);
          return;
        }
        setSugerencias(res);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [values.clienteRfc, clienteBloqueado, asociarCliente]);

  // On-change: revalidate only if already touched
  const handleChange = useCallback(
    (field: keyof NuevaVentaFormValues, raw: string) => {
      const v = field === "clienteRfc" ? raw.toUpperCase() : raw;
      const cleaned =
        field === "montoEstimado" ? v.replace(/[^\d.]/g, "") : v;
      const next = { ...values, [field]: cleaned };
      setValues((prev) => ({ ...prev, [field]: cleaned }));
      if (touched[field]) {
        const err = validateField(field, cleaned, next, VALIDATE_OPTS);
        setErrors((prev) => {
          const copy = { ...prev };
          if (err) copy[field] = err;
          else delete copy[field];
          return copy;
        });
      }
    },
    [values, touched],
  );

  // On-blur: mark touched + validate
  const handleBlur = useCallback(
    (field: keyof NuevaVentaFormValues) => {
      setTouched((prev) => ({ ...prev, [field]: true }));
      const err = validateField(field, values[field], values, VALIDATE_OPTS);
      setErrors((prev) => {
        const copy = { ...prev };
        if (err) copy[field] = err;
        else delete copy[field];
        return copy;
      });
    },
    [values],
  );

  // Threshold warning
  const montoNum = parseFloat(values.montoEstimado.replace(/,/g, "")) || 0;
  const tipoSel = values.tipoOperacion as TipoOperacion | "";
  const showThresholdNote =
    tipoSel !== "" &&
    montoNum > 0 &&
    !requiereIdentificacion(montoNum, tipoSel as TipoOperacion);

  // Footer text
  const footerText = useMemo(() => {
    if (status === "submitting") return "";
    const hasErrors = Object.keys(errors).length > 0;
    if (hasErrors && Object.values(touched).some(Boolean))
      return "Revisa los campos marcados";
    if (isValid) return "Listo para crear";
    return "Completa los campos obligatorios";
  }, [status, errors, isValid, touched]);

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    setServerError(null);

    const allTouched: typeof touched = {};
    for (const k of Object.keys(values) as (keyof NuevaVentaFormValues)[]) {
      allTouched[k] = true;
    }
    setTouched(allTouched);

    const result = validateForm(values, VALIDATE_OPTS);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }

    setStatus("submitting");

    try {
      const exp = await expedientesService.createExpediente(result.data);
      setStatus("success");
      router.push(`/expedientes/${exp.id}/instrucciones`);
    } catch (err) {
      setStatus("error");
      setServerError(
        err instanceof Error
          ? err.message
          : "Error al crear el expediente. Intenta de nuevo.",
      );
    }
  }

  function fieldErr(f: keyof NuevaVentaFormValues) {
    return touched[f] ? errors[f] : undefined;
  }

  const submitting = status === "submitting";
  const mostrarSugerencias =
    rfcFocus && !clienteBloqueado && sugerencias.length > 0;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-[var(--color-border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 sm:px-8 py-4">
          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => {
                if (returnTo === "back") router.back();
                else router.push(returnTo);
              }}
              className="text-[var(--color-tertiary)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
              aria-label="Volver"
            >
              <ArrowLeft size={18} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (returnTo === "back") router.back();
                else router.push(returnTo);
              }}
              className="text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
            >
              Dashboard
            </button>
            <ChevronRight size={14} className="text-[var(--color-border)]" />
            <span className="font-medium text-[var(--color-text)]">
              Nueva venta
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-6 sm:px-8 py-8">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
            {modoCliente ? `Nueva venta · ${values.clienteNombre}` : "Nueva venta"}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {modoCliente
              ? "Los datos del cliente están precargados. Solo captura los datos de la venta (tipo y monto)."
              : "Captura los datos iniciales para crear un expediente"}
          </p>
        </div>

        {/* Banner: datos cargados desde documento huérfano */}
        {documentoOrigen && (
          <div className="mb-6 rounded-xl border border-[var(--color-accent)]/40 bg-[var(--color-accent-light)] p-4">
            <div className="flex items-center gap-2">
              <Sparkles
                size={14}
                className="text-[var(--color-accent-text-dark)]"
                strokeWidth={2}
              />
              <p className="text-sm font-medium text-[var(--color-accent-text-dark)]">
                Datos cargados desde documento huérfano
              </p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                  Archivo origen
                </dt>
                <dd className="flex items-center gap-1 text-xs font-medium text-[var(--color-text)]">
                  <FileText size={11} className="text-[var(--color-muted)]" />
                  <span className="truncate">{documentoOrigen.archivo}</span>
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                  Tipo detectado
                </dt>
                <dd className="text-xs font-medium text-[var(--color-text)]">
                  {documentoOrigen.tipoDetectado}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                  Canal
                </dt>
                <dd className="text-xs font-medium text-[var(--color-text)]">
                  {documentoOrigen.canal}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                  Remitente
                </dt>
                <dd className="truncate text-xs font-medium text-[var(--color-text)]">
                  {documentoOrigen.remitente}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {/* Banner: asociado a un cliente existente */}
        {asociado && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-[var(--color-accent)]/40 bg-[var(--color-accent-light)] p-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <UserCheck
                size={16}
                className="text-[var(--color-accent-text-dark)] shrink-0"
                strokeWidth={2}
              />
              <p className="text-sm text-[var(--color-accent-text-dark)] min-w-0">
                Esta venta se asociará al cliente existente{" "}
                <span className="font-semibold">{asociado.nombre}</span>{" "}
                <span className="font-mono">({asociado.rfc})</span>
              </p>
            </div>
            {!modoCliente && (
              <button
                type="button"
                onClick={quitarAsociacion}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--color-accent-text-dark)] hover:bg-[var(--color-accent)]/10 transition-colors cursor-pointer shrink-0"
              >
                <X size={13} />
                Cambiar
              </button>
            )}
          </div>
        )}

        {/* Grid layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form card — 2/3 */}
          <div className="lg:col-span-2">
            <form
              onSubmit={handleSubmit}
              noValidate
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8"
            >
              <div className="flex flex-col gap-6">
                {/* RFC — primero (identidad del cliente) con autocompletado */}
                <Field
                  label="RFC del cliente"
                  required
                  error={fieldErr("clienteRfc")}
                  htmlFor="clienteRfc"
                >
                  <div className="relative">
                    <input
                      id="clienteRfc"
                      type="text"
                      placeholder="RAMS990101XXX"
                      autoComplete="off"
                      value={values.clienteRfc}
                      readOnly={isLocked("clienteRfc")}
                      onChange={(e) =>
                        handleChange("clienteRfc", e.target.value)
                      }
                      onFocus={() => setRfcFocus(true)}
                      onBlur={() => {
                        setTimeout(() => setRfcFocus(false), 150);
                        handleBlur("clienteRfc");
                      }}
                      maxLength={13}
                      aria-invalid={!!fieldErr("clienteRfc")}
                      aria-describedby={
                        fieldErr("clienteRfc") ? "clienteRfc-error" : undefined
                      }
                      className={`${inputClass(!!fieldErr("clienteRfc"))} font-mono ${isLocked("clienteRfc") ? "pr-9" : ""}`}
                      style={isLocked("clienteRfc") ? lockedStyle : undefined}
                    />
                    {isLocked("clienteRfc") && (
                      <Lock
                        size={14}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-tertiary)]"
                        aria-hidden="true"
                      />
                    )}

                    {/* Dropdown de sugerencias */}
                    {mostrarSugerencias && (
                      <ul
                        className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
                        role="listbox"
                      >
                        {sugerencias.map((s) => (
                          <li key={s.rfc}>
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                asociarCliente(s);
                              }}
                              className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--color-bg)] cursor-pointer"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-[var(--color-text)]">
                                  {s.nombre}
                                </span>
                                <span className="block truncate text-xs text-[var(--color-muted)]">
                                  {s.telefono} · {s.correo}
                                </span>
                              </span>
                              <span className="font-mono text-xs text-[var(--color-accent-text-dark)] shrink-0">
                                {s.rfc}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {!isLocked("clienteRfc") && (
                    <p className="text-xs text-[var(--color-tertiary)]">
                      Si el RFC coincide con un cliente existente, la venta se
                      asociará a él automáticamente.
                    </p>
                  )}
                </Field>

                {/* Nombre — full width */}
                <Field
                  label="Nombre del cliente"
                  required
                  error={fieldErr("clienteNombre")}
                  htmlFor="clienteNombre"
                >
                  <input
                    id="clienteNombre"
                    type="text"
                    placeholder="Ej. Sofía Ramírez"
                    value={values.clienteNombre}
                    readOnly={isLocked("clienteNombre")}
                    onChange={(e) =>
                      handleChange("clienteNombre", e.target.value)
                    }
                    onBlur={() => handleBlur("clienteNombre")}
                    aria-invalid={!!fieldErr("clienteNombre")}
                    aria-describedby={
                      fieldErr("clienteNombre")
                        ? "clienteNombre-error"
                        : undefined
                    }
                    className={inputClass(!!fieldErr("clienteNombre"))}
                    style={isLocked("clienteNombre") ? lockedStyle : undefined}
                  />
                </Field>

                {/* Teléfono + Correo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <Field
                    label="Teléfono"
                    required
                    error={fieldErr("clienteTelefono")}
                    htmlFor="clienteTelefono"
                  >
                    <input
                      id="clienteTelefono"
                      type="tel"
                      placeholder="55 1234 5678"
                      value={values.clienteTelefono}
                      readOnly={isLocked("clienteTelefono")}
                      onChange={(e) =>
                        handleChange("clienteTelefono", e.target.value)
                      }
                      onBlur={() => handleBlur("clienteTelefono")}
                      aria-invalid={!!fieldErr("clienteTelefono")}
                      aria-describedby={
                        fieldErr("clienteTelefono")
                          ? "clienteTelefono-error"
                          : undefined
                      }
                      className={inputClass(!!fieldErr("clienteTelefono"))}
                      style={isLocked("clienteTelefono") ? lockedStyle : undefined}
                    />
                  </Field>
                  <Field
                    label="Correo"
                    required
                    error={fieldErr("clienteCorreo")}
                    htmlFor="clienteCorreo"
                  >
                    <input
                      id="clienteCorreo"
                      type="email"
                      placeholder="cliente@correo.com"
                      autoComplete="email"
                      value={values.clienteCorreo}
                      readOnly={isLocked("clienteCorreo")}
                      onChange={(e) =>
                        handleChange("clienteCorreo", e.target.value)
                      }
                      onBlur={() => handleBlur("clienteCorreo")}
                      aria-invalid={!!fieldErr("clienteCorreo")}
                      aria-describedby={
                        fieldErr("clienteCorreo")
                          ? "clienteCorreo-error"
                          : undefined
                      }
                      className={inputClass(!!fieldErr("clienteCorreo"))}
                      style={isLocked("clienteCorreo") ? lockedStyle : undefined}
                    />
                  </Field>
                </div>

                {/* Datos de la venta: Monto + Tipo (siempre editables) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <Field
                    label="Monto estimado de la operación"
                    required
                    error={fieldErr("montoEstimado")}
                    htmlFor="montoEstimado"
                  >
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[var(--color-tertiary)]">
                        $
                      </span>
                      <input
                        id="montoEstimado"
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={values.montoEstimado}
                        onChange={(e) =>
                          handleChange("montoEstimado", e.target.value)
                        }
                        onBlur={() => handleBlur("montoEstimado")}
                        aria-invalid={!!fieldErr("montoEstimado")}
                        aria-describedby={
                          fieldErr("montoEstimado")
                            ? "montoEstimado-error"
                            : undefined
                        }
                        className={`${inputClass(!!fieldErr("montoEstimado"))} pl-7 tabular-nums`}
                      />
                    </div>
                  </Field>
                  <Field
                    label="Tipo de operación"
                    required
                    error={fieldErr("tipoOperacion")}
                    htmlFor="tipoOperacion"
                  >
                    <select
                      id="tipoOperacion"
                      value={values.tipoOperacion}
                      onChange={(e) =>
                        handleChange("tipoOperacion", e.target.value)
                      }
                      onBlur={() => handleBlur("tipoOperacion")}
                      aria-invalid={!!fieldErr("tipoOperacion")}
                      aria-describedby={
                        fieldErr("tipoOperacion")
                          ? "tipoOperacion-error"
                          : undefined
                      }
                      className={`${inputClass(!!fieldErr("tipoOperacion"))} cursor-pointer ${
                        values.tipoOperacion === ""
                          ? "text-[var(--color-tertiary)]"
                          : ""
                      }`}
                    >
                      <option value="" disabled>
                        Seleccionar...
                      </option>
                      <option value="ARMORING">Blindaje</option>
                      <option value="VEHICLE_SALE">Venta de vehículo</option>
                    </select>
                  </Field>
                </div>

                {/* Threshold note (informative, not blocking) */}
                {showThresholdNote && (
                  <p className="text-xs text-[var(--color-muted)] bg-[var(--color-bg-hover)] rounded-lg px-4 py-2.5">
                    El monto está por debajo del umbral de identificación para{" "}
                    {TIPO_OPERACION_LABELS[tipoSel as TipoOperacion]} ($
                    {UMBRALES_IDENTIFICACION[
                      tipoSel as TipoOperacion
                    ].toLocaleString("es-MX")}
                    ). El expediente se puede crear igualmente.
                  </p>
                )}
              </div>

              {/* Server error banner */}
              {serverError && (
                <div
                  className="mt-6 rounded-lg bg-[var(--color-error-bg)] px-4 py-2.5 text-sm text-[var(--color-error-text)]"
                  role="alert"
                >
                  {serverError}
                </div>
              )}

              {/* Footer */}
              <div className="mt-8 flex items-center justify-between border-t border-[var(--color-border-inner)] pt-6">
                <span className="text-xs text-[var(--color-tertiary)]">
                  {footerText}
                </span>
                <button
                  type="submit"
                  disabled={!isValid || submitting}
                  className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                    isValid && !submitting
                      ? "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]"
                      : "bg-[var(--color-disabled-bg)] text-[var(--color-tertiary)] cursor-not-allowed"
                  }`}
                >
                  {submitting && (
                    <Loader2
                      size={14}
                      className="animate-spin"
                      strokeWidth={2}
                    />
                  )}
                  {submitting ? "Creando expediente..." : "Crear expediente"}
                </button>
              </div>
            </form>
          </div>

          {/* Sidebar — 1/3 */}
          <div className="flex flex-col gap-5">
            {/* Preview card */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
              <div className="flex items-center gap-1.5 mb-3">
                <Sparkles
                  size={12}
                  className="text-[var(--color-tertiary)]"
                  strokeWidth={2}
                />
                <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-tertiary)]">
                  Vista previa
                </span>
              </div>
              <p className="font-mono text-xs tabular-nums text-[var(--color-muted)]">
                {codigoPreview}
              </p>
              <p className="mt-1.5 text-base font-medium text-[var(--color-text)]">
                {values.clienteNombre.trim() || (
                  <span className="text-[var(--color-border)]">
                    Cliente sin nombre
                  </span>
                )}
              </p>
              {asociado && (
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--color-accent-text-dark)]">
                  <Check size={12} />
                  Cliente existente
                </p>
              )}
              <div className="mt-2.5">
                <StatusBadge estado="CAPTURING" />
              </div>
            </div>

            {/* Roadmap card */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
              <h3 className="text-sm font-semibold text-[var(--color-text)] mb-1.5">
                ¿Qué pasará después?
              </h3>
              <p className="text-xs text-[var(--color-muted)] mb-5">
                El expediente se creará en estado{" "}
                <code className="font-mono text-[var(--color-text-secondary)]">
                  en captura
                </code>{" "}
                y podrás enviar instrucciones al cliente.
              </p>
              <Roadmap />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
