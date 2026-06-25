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

export const TIPO_OPERACION_LABEL: Record<TipoOperacion, string> = {
  blindaje: "Blindaje",
  venta_vehiculo: "Venta vehículo",
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
export type EstadoDocumento =
  | "pendiente"
  | "recibido"
  | "validado"
  | "rechazado"
  | "vencido"
  | "reemplazado";

export type MotivoRechazoCategoria =
  | "ilegible"
  | "tipo_no_coincide"
  | "vencido"
  | "otro";

export type MotivoRechazo = {
  categoria: MotivoRechazoCategoria;
  texto: string;
};

export type Canal = "whatsapp" | "correo" | "upload";

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

export type PrioridadNextStep = "alta" | "media" | "baja";

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
