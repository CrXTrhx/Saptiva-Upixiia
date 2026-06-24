// --- Auth ---
export type User = {
  id: string;
  email: string;
  nombre: string;
};

export type LoginCredentials = {
  email: string;
  password: string;
};

export type AuthResult =
  | { success: true; user: User }
  | { success: false; error: string };

// --- Expedientes ---
export const ESTADOS = [
  "en_captura",
  "en_recepcion",
  "en_validacion",
  "completo",
  "incompleto_vencido",
  "cancelado",
  "archivado",
] as const;
export type Estado = (typeof ESTADOS)[number];

export const DOCUMENTOS_REQUERIDOS = [
  "INE",
  "CURP",
  "CSF",
  "comprobante",
] as const;
export type DocumentoRequerido = (typeof DOCUMENTOS_REQUERIDOS)[number];

export type TipoOperacion = "blindaje" | "venta_vehiculo";

export type Expediente = {
  id: string;
  codigo: string;
  clienteNombre: string;
  clienteRfc?: string;
  clienteTelefono: string;
  clienteCorreo: string;
  fechaCreacion: string;
  estado: Estado;
  nextStepPrioritario: string;
  capturista: string;
  documentosFaltantes: DocumentoRequerido[];
  ultimaActividad: string;
};

export type CreateExpedienteRequest = {
  clienteNombre: string;
  clienteTelefono: string;
  clienteCorreo: string;
  clienteRfc?: string;
  montoEstimado: number;
  tipoOperacion: TipoOperacion;
};

export type CreateExpedienteResponse = Expediente;

export type RangoFecha =
  | { preset: "hoy" | "7dias" | "30dias" }
  | { desde: string; hasta: string };

export type ExpedienteQuery = {
  search?: string;
  estado?: Estado;
  rangoFecha?: RangoFecha;
  documentoFaltante?: DocumentoRequerido;
};

export type ConteoEstados = Record<Estado, number>;
