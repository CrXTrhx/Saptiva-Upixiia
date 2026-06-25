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
// Codigos en INGLES (los dicta el backend). Las etiquetas en espanol para la UI
// estan en los *_LABELS de abajo y en lib/status.ts.
export const ESTADOS = [
  "CAPTURING",
  "RECEIVING",
  "IN_VALIDATION",
  "COMPLETE",
  "INCOMPLETE_EXPIRED",
  "CANCELLED",
  "ARCHIVED",
] as const;
export type Estado = (typeof ESTADOS)[number];

export const DOCUMENTOS_REQUERIDOS = [
  "OFFICIAL_ID",
  "CURP",
  "TAX_STATUS_CERT",
  "PROOF_OF_ADDRESS",
] as const;
export type DocumentoRequerido = (typeof DOCUMENTOS_REQUERIDOS)[number];

export type TipoOperacion = "ARMORING" | "VEHICLE_SALE";

// --- Etiquetas para mostrar en la UI (codigo ingles -> texto espanol) ---
export const DOC_TIPO_LABELS: Record<string, string> = {
  OFFICIAL_ID: "INE",
  CURP: "CURP",
  TAX_STATUS_CERT: "CSF",
  PROOF_OF_ADDRESS: "Comprobante",
};

export const ESTADO_DOC_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  RECEIVED: "Recibido",
  VALIDATED: "Validado",
  REJECTED: "Rechazado",
  EXPIRED: "Vencido",
  REPLACED: "Reemplazado",
};

export const CANAL_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Correo",
  DIRECT_UPLOAD: "Carga manual",
};

export const MOTIVO_LABELS: Record<string, string> = {
  ILLEGIBLE: "Ilegible",
  TYPE_MISMATCH: "Tipo no coincide",
  EXPIRED: "Vencido",
  OTHER: "Otro",
};

export const PRIORIDAD_LABELS: Record<string, string> = {
  HIGH: "Alta",
  MEDIUM: "Media",
  LOW: "Baja",
};

export const TIPO_OPERACION_LABEL: Record<TipoOperacion, string> = {
  ARMORING: "Blindaje",
  VEHICLE_SALE: "Venta de vehiculo",
};

export type Expediente = {
  id: string;
  codigo: string;
  clienteNombre: string;
  clienteRfc?: string;
  clienteTelefono: string;
  clienteCorreo: string;
  fechaCreacion: string;
  estado: Estado;
  tipoOperacion: TipoOperacion;
  montoEstimado: number;
  nextStepPrioritario: string;
  capturista: string;
  documentosFaltantes: DocumentoRequerido[];
  ultimaActividad: string;
};

export type ClienteAgrupado = {
  id: string;
  nombre: string;
  telefono: string;
  correo: string;
  rfc?: string;
  montoTotal: number;
  totalExpedientes: number;
  conteoPorEstado: Partial<Record<Estado, number>>;
  tieneUrgente: boolean;
  expedientes: Expediente[];
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

// --- P5 Detail types ---
export type EstadoDocumento =
  | "PENDING"
  | "RECEIVED"
  | "VALIDATED"
  | "REJECTED"
  | "EXPIRED"
  | "REPLACED";

export type MotivoRechazoCategoria =
  | "ILLEGIBLE"
  | "TYPE_MISMATCH"
  | "EXPIRED"
  | "OTHER";

export type MotivoRechazo = {
  categoria: MotivoRechazoCategoria;
  texto: string;
};

export type Canal = "WHATSAPP" | "EMAIL" | "DIRECT_UPLOAD";

export type Documento = {
  id: string;
  tipo: DocumentoRequerido;
  estado: EstadoDocumento;
  filename: string;
  archivoUrl?: string;
  mimeType: string;
  canal: Canal;
  remitente: string;
  fechaRecepcion: string;
  datosExtraidos?: Record<string, string>;
  motivoRechazo?: MotivoRechazo;
  rechazoAutomatico?: boolean;
  versionAnterior?: Documento;
};

export type ChecklistItem = {
  tipo: DocumentoRequerido;
  estado: EstadoDocumento;
  documentoId?: string;
};

export type PrioridadNextStep = "HIGH" | "MEDIUM" | "LOW";

export type NextStep = {
  id: string;
  texto: string;
  prioridad: PrioridadNextStep;
};

export type TonoEvento = "ok" | "warn" | "accent" | "neutral";

export type Evento = {
  id: string;
  tipo: string;
  descripcion: string;
  timestamp: string;
  tono: TonoEvento;
};

export type Nota = {
  id: string;
  texto: string;
  autor: string;
  timestamp: string;
};

export type ConsultaLLM = {
  id: string;
  pregunta: string;
  respuesta: "si" | "no";
  razon: string;
  disclaimer: string;
};

export type ExpedienteDetalle = {
  expediente: Expediente & {
    montoEstimado: number;
    tipoOperacion: TipoOperacion;
  };
  checklist: ChecklistItem[];
  documentos: Documento[];
  nextSteps: NextStep[];
  historial: Evento[];
  notas: Nota[];
};
