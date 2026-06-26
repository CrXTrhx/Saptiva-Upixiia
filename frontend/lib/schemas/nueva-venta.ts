import { z } from "zod";

const RFC_PERSONA_FISICA = /^[A-Z]{4}\d{6}[A-Z0-9]{3}$/;

export const nuevaVentaSchema = z.object({
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

  montoEstimado: z
    .string()
    .min(1, "Requerido")
    .transform((v) => {
      const cleaned = v.replace(/,/g, "");
      const n = Number(cleaned);
      if (isNaN(n)) return 0;
      return n;
    })
    .refine((n) => n > 0, "Debe ser mayor a $0"),

  tipoOperacion: z.enum(["ARMORING", "VEHICLE_SALE"], {
    message: "Selecciona una opción",
  }),
});

export type NuevaVentaFormValues = {
  clienteNombre: string;
  clienteTelefono: string;
  clienteCorreo: string;
  clienteRfc: string;
  montoEstimado: string;
  tipoOperacion: string;
};

export const INITIAL_VALUES: NuevaVentaFormValues = {
  clienteNombre: "",
  clienteTelefono: "",
  clienteCorreo: "",
  clienteRfc: "",
  montoEstimado: "",
  tipoOperacion: "",
};

export type FieldErrors = Partial<Record<keyof NuevaVentaFormValues, string>>;

export function validateForm(values: NuevaVentaFormValues): {
  success: true;
  data: z.output<typeof nuevaVentaSchema>;
} | {
  success: false;
  errors: FieldErrors;
} {
  const result = nuevaVentaSchema.safeParse(values);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof NuevaVentaFormValues;
    if (!errors[field]) {
      errors[field] = issue.message;
    }
  }
  return { success: false, errors };
}

export function validateField(
  field: keyof NuevaVentaFormValues,
  value: string,
  allValues: NuevaVentaFormValues,
): string | undefined {
  const result = validateForm({ ...allValues, [field]: value });
  if (result.success) return undefined;
  return result.errors[field];
}
