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
  Plus,
  Trash2,
  Shield,
  Car,
  type LucideIcon,
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
  validateClienteField,
  INITIAL_VALUES,
  NUEVA_OPERACION,
  type NuevaVentaFormValues,
  type OperacionFormValue,
  type FieldErrors,
  type OperacionErrors,
  type ClienteField,
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
  "w-full rounded-lg border bg-[var(--color-surface)] px-3.5 py-2.5 text-base sm:text-sm text-[var(--color-text)] placeholder:text-[var(--color-tertiary)] transition-colors focus:outline-none focus:ring-2 hover:border-[var(--color-muted)]";
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

// --- Helpers de operaciones ---

function tiposSeleccionados(operaciones: OperacionFormValue[]): string[] {
  return Array.from(new Set(operaciones.map((o) => o.tipo).filter(Boolean)));
}

function montoTotal(operaciones: OperacionFormValue[]): number {
  return operaciones.reduce((acc, o) => {
    const n = parseFloat(o.monto.replace(/,/g, ""));
    return acc + (isNaN(n) ? 0 : n);
  }, 0);
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
          operaciones: [
            {
              tipo: prefill.tipoOperacion || "",
              monto: prefill.montoEstimado || "",
            },
          ],
        }
      : INITIAL_VALUES,
  );
  const [touched, setTouched] = useState<Partial<Record<ClienteField, true>>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  // Errores y "touched" de las líneas de operación (paralelos a values.operaciones).
  const [opErrors, setOpErrors] = useState<OperacionErrors[]>([]);
  const [opTouched, setOpTouched] = useState<boolean[]>([]);
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

  const tipos = useMemo(
    () => tiposSeleccionados(values.operaciones),
    [values.operaciones],
  );
  const total = useMemo(
    () => montoTotal(values.operaciones),
    [values.operaciones],
  );
  const codigoPreview = useMemo(
    () => expedientesService.previewNextCodigo(tipos as Array<TipoOperacion | "">),
    [tipos],
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

  // On-change de campos del cliente: revalida solo si ya fue tocado.
  const handleChange = useCallback(
    (field: ClienteField, raw: string) => {
      const v = field === "clienteRfc" ? raw.toUpperCase() : raw;
      const next = { ...values, [field]: v };
      setValues((prev) => ({ ...prev, [field]: v }));
      if (touched[field]) {
        const err = validateClienteField(field, v, next, VALIDATE_OPTS);
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

  // On-blur de campos del cliente: marca touched + valida.
  const handleBlur = useCallback(
    (field: ClienteField) => {
      setTouched((prev) => ({ ...prev, [field]: true }));
      const err = validateClienteField(field, values[field], values, VALIDATE_OPTS);
      setErrors((prev) => {
        const copy = { ...prev };
        if (err) copy[field] = err;
        else delete copy[field];
        return copy;
      });
    },
    [values],
  );

  // --- Operaciones: revalida toda la lista y refresca los errores de líneas tocadas.
  const revalidarOperaciones = useCallback(
    (nextValues: NuevaVentaFormValues, tocadas: boolean[]) => {
      const result = validateForm(nextValues, VALIDATE_OPTS);
      const lineErrs = result.success ? [] : result.lineErrors;
      setOpErrors(
        nextValues.operaciones.map((_, i) =>
          tocadas[i] ? (lineErrs[i] ?? {}) : {},
        ),
      );
    },
    [],
  );

  const updateOperacion = useCallback(
    (index: number, field: keyof OperacionFormValue, raw: string) => {
      const v = field === "monto" ? raw.replace(/[^\d.]/g, "") : raw;
      setValues((prev) => {
        const operaciones = prev.operaciones.map((o, i) =>
          i === index ? { ...o, [field]: v } : o,
        );
        const next = { ...prev, operaciones };
        setOpTouched((prevT) => {
          revalidarOperaciones(next, prevT);
          return prevT;
        });
        return next;
      });
    },
    [revalidarOperaciones],
  );

  const blurOperacion = useCallback(
    (index: number) => {
      setOpTouched((prev) => {
        const tocadas = [...prev];
        tocadas[index] = true;
        revalidarOperaciones(values, tocadas);
        return tocadas;
      });
    },
    [values, revalidarOperaciones],
  );

  const addOperacion = useCallback(() => {
    setValues((prev) => ({
      ...prev,
      operaciones: [...prev.operaciones, { ...NUEVA_OPERACION }],
    }));
    setOpErrors((prev) => [...prev, {}]);
    setOpTouched((prev) => [...prev, false]);
  }, []);

  const removeOperacion = useCallback(
    (index: number) => {
      setValues((prev) => {
        if (prev.operaciones.length <= 1) return prev;
        return {
          ...prev,
          operaciones: prev.operaciones.filter((_, i) => i !== index),
        };
      });
      setOpErrors((prev) => prev.filter((_, i) => i !== index));
      setOpTouched((prev) => prev.filter((_, i) => i !== index));
    },
    [],
  );

  // Footer text
  const footerText = useMemo(() => {
    if (status === "submitting") return "";
    const hasClientErrors = Object.keys(errors).length > 0;
    const hasOpErrors = opErrors.some((e) => Object.keys(e).length > 0);
    if (
      (hasClientErrors || hasOpErrors) &&
      (Object.values(touched).some(Boolean) || opTouched.some(Boolean))
    )
      return "Revisa los campos marcados";
    if (isValid) return "Listo para crear";
    return "Completa los campos obligatorios";
  }, [status, errors, opErrors, isValid, touched, opTouched]);

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    setServerError(null);

    const allTouched: Partial<Record<ClienteField, true>> = {
      clienteNombre: true,
      clienteTelefono: true,
      clienteCorreo: true,
      clienteRfc: true,
    };
    setTouched(allTouched);
    const todasOpTouched = values.operaciones.map(() => true);
    setOpTouched(todasOpTouched);

    const result = validateForm(values, VALIDATE_OPTS);
    if (!result.success) {
      setErrors(result.clientErrors);
      setOpErrors(
        values.operaciones.map((_, i) => result.lineErrors[i] ?? {}),
      );
      return;
    }

    setStatus("submitting");

    try {
      const exp = await expedientesService.createExpediente({
        clienteNombre: result.data.clienteNombre,
        clienteTelefono: result.data.clienteTelefono,
        clienteCorreo: result.data.clienteCorreo,
        clienteRfc: result.data.clienteRfc,
        operaciones: result.data.operaciones,
      });
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

  function fieldErr(f: ClienteField) {
    return touched[f] ? errors[f] : undefined;
  }

  const submitting = status === "submitting";
  const mostrarSugerencias =
    rfcFocus && !clienteBloqueado && sugerencias.length > 0;

  return (
    <div className="min-h-dvh">
      {/* Header */}
      <header className="border-b border-[var(--color-border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8 py-4">
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
      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
            {modoCliente ? `Nueva venta · ${values.clienteNombre}` : "Nueva venta"}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {modoCliente
              ? "Los datos del cliente están precargados. Solo captura las operaciones de la venta."
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
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-8 pb-24 sm:pb-8"
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

                {/* Operaciones de la venta */}
                <OperacionesEditor
                  operaciones={values.operaciones}
                  errors={opErrors}
                  total={total}
                  onUpdate={updateOperacion}
                  onBlur={blurOperacion}
                  onAdd={addOperacion}
                  onRemove={removeOperacion}
                />
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

              {/* Footer — en móvil: barra fija al fondo (CTA siempre accesible en
                  formularios largos); en sm+: pie de formulario normal. */}
              <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-[var(--color-border-inner)] bg-[var(--color-surface)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:static sm:z-auto sm:mt-8 sm:gap-0 sm:bg-transparent sm:px-0 sm:py-0 sm:pt-6 sm:shadow-none">
                <span className="min-w-0 truncate text-xs text-[var(--color-tertiary)]">
                  {footerText}
                </span>
                <button
                  type="submit"
                  disabled={!isValid || submitting}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
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
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
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
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6">
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

// --- Editor de operaciones (cada operación: tipo + monto, una por una) ---

// Tipos seleccionables, con su icono (lucide). Se capturan de uno en uno: para
// 3 blindajes se agregan 3 operaciones, cada una con su propio monto.
const TIPOS_OPERACION: { value: TipoOperacion; label: string; Icon: LucideIcon }[] =
  [
    { value: "ARMORING", label: "Blindaje", Icon: Shield },
    { value: "VEHICLE_SALE", label: "Venta de vehículo", Icon: Car },
  ];

function OperacionesEditor({
  operaciones,
  errors,
  total,
  onUpdate,
  onBlur,
  onAdd,
  onRemove,
}: {
  operaciones: OperacionFormValue[];
  errors: OperacionErrors[];
  total: number;
  onUpdate: (i: number, field: keyof OperacionFormValue, v: string) => void;
  onBlur: (i: number) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--color-border-inner)] pt-6">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
          Operaciones de la venta
          <span className="text-[var(--color-accent)] ml-0.5">*</span>
        </span>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--color-accent-text-dark)] hover:bg-[var(--color-accent)]/10 transition-colors cursor-pointer"
        >
          <Plus size={13} />
          Agregar operación
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        {operaciones.map((op, i) => {
          const err = errors[i] ?? {};
          const tipoSel = op.tipo as TipoOperacion | "";
          const montoNum = parseFloat(op.monto.replace(/,/g, "")) || 0;
          const showThresholdNote =
            tipoSel !== "" &&
            montoNum > 0 &&
            !requiereIdentificacion(montoNum, tipoSel as TipoOperacion);
          return (
            <div
              key={i}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5"
            >
              {/* Encabezado de la operación */}
              <div className="flex items-center gap-2 mb-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--color-accent-light)] text-[10px] font-semibold tabular-nums text-[var(--color-accent-text-dark)]">
                  {i + 1}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted)]">
                  Operación
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  disabled={operaciones.length <= 1}
                  aria-label="Quitar operación"
                  className={`ml-auto rounded-md p-1.5 transition-colors ${
                    operaciones.length <= 1
                      ? "text-[var(--color-border)] cursor-not-allowed"
                      : "text-[var(--color-tertiary)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-bg)] cursor-pointer"
                  }`}
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="flex flex-wrap items-start gap-2.5">
                {/* Tipo: selector segmentado con icono */}
                <div className="flex-1 min-w-[240px]">
                  <div
                    role="radiogroup"
                    aria-label="Tipo de operación"
                    aria-invalid={!!err.tipo}
                    className="grid grid-cols-2 gap-1.5"
                  >
                    {TIPOS_OPERACION.map(({ value, label, Icon }) => {
                      const selected = op.tipo === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => {
                            onUpdate(i, "tipo", value);
                            onBlur(i);
                          }}
                          className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-colors cursor-pointer ${
                            selected
                              ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent-text-dark)]"
                              : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:border-[var(--color-tertiary)]"
                          }`}
                        >
                          <Icon size={15} strokeWidth={1.9} />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {err.tipo && (
                    <p className="mt-1 text-xs text-[var(--color-error)]" role="alert">
                      {err.tipo}
                    </p>
                  )}
                </div>

                {/* Monto */}
                <div className="w-40 shrink-0">
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[var(--color-tertiary)]">
                      $
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label="Monto de la operación"
                      value={op.monto}
                      onChange={(e) => onUpdate(i, "monto", e.target.value)}
                      onBlur={() => onBlur(i)}
                      aria-invalid={!!err.monto}
                      className={`${inputClass(!!err.monto)} pl-7 tabular-nums`}
                    />
                  </div>
                  {err.monto && (
                    <p className="mt-1 text-xs text-[var(--color-error)]" role="alert">
                      {err.monto}
                    </p>
                  )}
                </div>
              </div>

              {showThresholdNote && (
                <p className="mt-2.5 text-xs text-[var(--color-muted)] bg-[var(--color-bg-hover)] rounded-lg px-3 py-2">
                  El monto está por debajo del umbral de identificación para{" "}
                  {TIPO_OPERACION_LABELS[tipoSel as TipoOperacion]} ($
                  {UMBRALES_IDENTIFICACION[tipoSel as TipoOperacion].toLocaleString(
                    "es-MX",
                  )}
                  ). El expediente se puede crear igualmente.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div className="flex items-center justify-between border-t border-[var(--color-border-inner)] pt-3">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
          Total del expediente
        </span>
        <span className="text-base font-semibold tabular-nums text-[var(--color-text)]">
          $
          {total.toLocaleString("es-MX", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>
    </div>
  );
}
