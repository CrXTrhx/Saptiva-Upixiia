import { z } from "zod";

const RFC_PERSONA_FISICA = /^[A-Z]{4}\d{6}[A-Z0-9]{3}$/;

// Tipos seleccionables por línea de operación.
const TIPOS = ["ARMORING", "VEHICLE_SALE"] as const;

// --- Sub-schema de una operación (tipo + monto) ---
// Cada operación se captura por separado (3 blindajes = 3 operaciones), así que no
// hay campo "cantidad": cada línea representa una sola unidad con su propio monto.

const montoNumber = z
  .string()
  .min(1, "Requerido")
  .transform((v) => {
    const n = Number(v.replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  })
  .refine((n) => n > 0, "Debe ser mayor a $0");

const operacionSchema = z.object({
  tipo: z.enum(TIPOS, { message: "Selecciona un tipo" }),
  monto: montoNumber,
});

// --- Schema del formulario completo ---

const clienteFields = {
  clienteNombre: z
    .string()
    .trim()
    .min(3, "Mínimo 3 caracteres")
    .max(120, "Máximo 120 caracteres"),

  clienteTelefono: z
    .string()
    .transform((v) => v.replace(/[\s\-()]/g, ""))
    .pipe(z.string().regex(/^\d{10}$/, "Debe tener 10 dígitos")),

  clienteCorreo: z
    .string()
    .trim()
    .min(1, "Requerido")
    .email("Formato de correo inválido"),

  operaciones: z.array(operacionSchema).min(1, "Agrega al menos una operación"),
};

export const nuevaVentaSchema = z.object({
  ...clienteFields,
  clienteRfc: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => v || undefined)
    .pipe(
      z
        .string()
        .regex(RFC_PERSONA_FISICA, "RFC inválido (4 letras + 6 dígitos + 3 homoclave)")
        .optional(),
    ),
});

// Variante con RFC OBLIGATORIO: el RFC es la identidad del cliente (con él se
// relacionan los expedientes), así que al crear una nueva venta es requerido.
export const nuevaVentaSchemaRfcRequerido = z.object({
  ...clienteFields,
  clienteRfc: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Requerido")
    .pipe(
      z
        .string()
        .regex(
          RFC_PERSONA_FISICA,
          "RFC inválido (4 letras + 6 dígitos + 3 homoclave)",
        ),
    ),
});

// --- Tipos del formulario (todos string para inputs controlados) ---

export type OperacionFormValue = {
  tipo: string;
  monto: string;
};

export type NuevaVentaFormValues = {
  clienteNombre: string;
  clienteTelefono: string;
  clienteCorreo: string;
  clienteRfc: string;
  operaciones: OperacionFormValue[];
};

export const NUEVA_OPERACION: OperacionFormValue = {
  tipo: "",
  monto: "",
};

export const INITIAL_VALUES: NuevaVentaFormValues = {
  clienteNombre: "",
  clienteTelefono: "",
  clienteCorreo: "",
  clienteRfc: "",
  operaciones: [{ ...NUEVA_OPERACION }],
};

// Errores de los campos del cliente.
export type ClienteField =
  | "clienteNombre"
  | "clienteTelefono"
  | "clienteCorreo"
  | "clienteRfc";
export type FieldErrors = Partial<Record<ClienteField, string>>;

// Errores de una operación.
export type OperacionField = "tipo" | "monto";
export type OperacionErrors = Partial<Record<OperacionField, string>>;

type ValidateOptions = { rfcRequired?: boolean };

export type ValidateResult =
  | { success: true; data: z.output<typeof nuevaVentaSchema> }
  | {
      success: false;
      clientErrors: FieldErrors;
      lineErrors: OperacionErrors[];
      operacionesError?: string;
    };

export function validateForm(
  values: NuevaVentaFormValues,
  opts: ValidateOptions = {},
): ValidateResult {
  const schema = opts.rfcRequired
    ? nuevaVentaSchemaRfcRequerido
    : nuevaVentaSchema;
  const result = schema.safeParse(values);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const clientErrors: FieldErrors = {};
  const lineErrors: OperacionErrors[] = [];
  let operacionesError: string | undefined;

  for (const issue of result.error.issues) {
    const [p0, p1, p2] = issue.path;
    if (p0 === "operaciones") {
      if (typeof p1 === "number") {
        const line = lineErrors[p1] ?? (lineErrors[p1] = {});
        const field = p2 as OperacionField | undefined;
        if (field && !line[field]) line[field] = issue.message;
      } else if (!operacionesError) {
        operacionesError = issue.message;
      }
    } else {
      const field = p0 as ClienteField;
      if (field && !clientErrors[field]) clientErrors[field] = issue.message;
    }
  }

  return { success: false, clientErrors, lineErrors, operacionesError };
}

// Valida un solo campo del cliente (para validación on-blur).
export function validateClienteField(
  field: ClienteField,
  value: string,
  allValues: NuevaVentaFormValues,
  opts: ValidateOptions = {},
): string | undefined {
  const result = validateForm({ ...allValues, [field]: value }, opts);
  if (result.success) return undefined;
  return result.clientErrors[field];
}
