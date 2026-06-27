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
// Los VALORES son los códigos en inglés del backend (status_code). Las etiquetas
// en español viven en los mapas *_LABELS para mostrarse en la UI.
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

export const ESTADO_LABELS: Record<Estado, string> = {
  CAPTURING: "Captura",
  RECEIVING: "Recepción",
  IN_VALIDATION: "Validación",
  COMPLETE: "Completo",
  INCOMPLETE_EXPIRED: "Vencido",
  CANCELLED: "Cancelado",
  ARCHIVED: "Archivado",
};

// Códigos de tipo de documento del backend (DocType). Etiqueta en español aparte.
export const DOCUMENTOS_REQUERIDOS = [
  "OFFICIAL_ID",
  "CURP",
  "TAX_STATUS_CERT",
  "PROOF_OF_ADDRESS",
] as const;
export type DocumentoRequerido = (typeof DOCUMENTOS_REQUERIDOS)[number];

export const DOCUMENTO_REQUERIDO_LABELS: Record<DocumentoRequerido, string> = {
  OFFICIAL_ID: "INE",
  CURP: "CURP",
  TAX_STATUS_CERT: "CSF",
  PROOF_OF_ADDRESS: "Comprobante",
};

export type TipoOperacion = "ARMORING" | "VEHICLE_SALE";

export const TIPO_OPERACION_LABEL: Record<TipoOperacion, string> = {
  ARMORING: "Blindaje",
  VEHICLE_SALE: "Venta vehículo",
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

// Vista agrupada del dashboard: un cliente con sus expedientes asociados.
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
  // Ya vienen filtrados por el query y ordenados por prioridad.
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
// Estados de documento del backend (DocStatus + checklist PENDING).
export type EstadoDocumento =
  | "PROCESSING"
  | "PENDING"
  | "RECEIVED"
  | "VALIDATED"
  | "REJECTED"
  | "EXPIRED"
  | "REPLACED";

export const ESTADO_DOCUMENTO_LABELS: Record<EstadoDocumento, string> = {
  PROCESSING: "Procesando",
  PENDING: "Pendiente",
  RECEIVED: "Recibido",
  VALIDATED: "Validado",
  REJECTED: "Rechazado",
  EXPIRED: "Vencido",
  REPLACED: "Reemplazado",
};

// Motivos de rechazo del backend (RejectionReason).
export type MotivoRechazoCategoria =
  | "ILLEGIBLE"
  | "TYPE_MISMATCH"
  | "EXPIRED"
  | "OTHER";

export const MOTIVO_RECHAZO_LABELS: Record<MotivoRechazoCategoria, string> = {
  ILLEGIBLE: "Ilegible",
  TYPE_MISMATCH: "Tipo de documento no coincide",
  EXPIRED: "Documento vencido",
  OTHER: "Otro",
};

export type MotivoRechazo = {
  categoria: MotivoRechazoCategoria;
  texto: string;
};

// Canales del backend (Channel).
export type Canal = "WHATSAPP" | "EMAIL" | "DIRECT_UPLOAD";

export const CANAL_LABELS: Record<Canal, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Correo",
  DIRECT_UPLOAD: "Carga manual",
};

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

// Prioridades del backend (Priority).
export type PrioridadNextStep = "HIGH" | "MEDIUM" | "LOW";

export const PRIORIDAD_LABELS: Record<PrioridadNextStep, string> = {
  HIGH: "Alta",
  MEDIUM: "Media",
  LOW: "Baja",
};

export type NextStep = {
  id: string;
  texto: string;
  prioridad: PrioridadNextStep;
};

export type TonoEvento = "ok" | "warn" | "accent" | "neutral";

// Etiquetas en español para los códigos de tipo de evento del backend (EventType).
export const EVENT_TYPE_LABELS: Record<string, string> = {
  CASE_CREATED: "Expediente creado",
  CASE_UPDATED: "Datos actualizados",
  STATUS_CHANGED: "Cambio de estado",
  DOCUMENT_RECEIVED: "Documento recibido",
  DOCUMENT_VALIDATED: "Documento validado",
  DOCUMENT_REJECTED: "Documento rechazado",
  DOCUMENT_AUTO_REJECTED: "Rechazo automático",
  AUTO_REJECT_REVERTED: "Rechazo revertido",
  DOCUMENT_REPLACED: "Documento reemplazado",
  REMINDER_SENT: "Recordatorio enviado",
  INSTRUCTIONS_RESENT: "Instrucciones reenviadas",
  NOTE_ADDED: "Nota agregada",
  CASE_COMPLETED: "Expediente completado",
  CASE_CANCELLED: "Expediente cancelado",
  CASE_ARCHIVED: "Expediente archivado",
  LLM_QUERY: "Consulta al asistente",
  ORPHAN_ASSIGNED: "Documento asignado",
};

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
