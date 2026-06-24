import type {
  ConteoEstados,
  CreateExpedienteRequest,
  CreateExpedienteResponse,
  Expediente,
  ExpedienteQuery,
  Estado,
  RangoFecha,
  ExpedienteDetalle,
  Documento,
  ChecklistItem,
  NextStep,
  Evento,
  Nota,
  ConsultaLLM,
  MotivoRechazo,
  DocumentoRequerido,
  EstadoDocumento,
  Canal,
  TipoOperacion,
} from "@/lib/types";

// --- Priority sort (business rule: urgents first, then validation, then missing docs, then rest) ---

const INACTIVIDAD_MS = 3 * 24 * 60 * 60 * 1000;

const ESTADO_PRIORIDAD: Record<Estado, number> = {
  incompleto_vencido: 0,
  en_validacion: 1,
  en_recepcion: 2,
  en_captura: 3,
  completo: 4,
  cancelado: 5,
  archivado: 5,
};

function calcularPrioridad(exp: Expediente): number {
  const inactivo =
    Date.now() - new Date(exp.ultimaActividad).getTime() > INACTIVIDAD_MS;

  // Inactivos >3 days get bumped to urgent tier — but only for active states, not terminal ones
  if (
    inactivo &&
    exp.estado !== "cancelado" &&
    exp.estado !== "archivado" &&
    exp.estado !== "completo" &&
    exp.estado !== "incompleto_vencido"
  )
    return 0;
  return ESTADO_PRIORIDAD[exp.estado];
}

function ordenarPorPrioridad(expedientes: Expediente[]): Expediente[] {
  return [...expedientes].sort((a, b) => {
    const pa = calcularPrioridad(a);
    const pb = calcularPrioridad(b);
    if (pa !== pb) return pa - pb;
    return (
      new Date(a.fechaCreacion).getTime() - new Date(b.fechaCreacion).getTime()
    );
  });
}

// --- Filtering ---

function matchesSearch(exp: Expediente, search: string): boolean {
  const q = search.toLowerCase();
  return (
    exp.codigo.toLowerCase().includes(q) ||
    exp.clienteNombre.toLowerCase().includes(q) ||
    (exp.clienteRfc?.toLowerCase().includes(q) ?? false) ||
    exp.clienteTelefono.includes(q) ||
    exp.clienteCorreo.toLowerCase().includes(q)
  );
}

function matchesRangoFecha(fecha: string, rango: RangoFecha): boolean {
  const d = new Date(fecha);
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if ("preset" in rango) {
    switch (rango.preset) {
      case "hoy":
        return d >= startOfDay;
      case "7dias":
        return d >= new Date(startOfDay.getTime() - 6 * 24 * 60 * 60 * 1000);
      case "30dias":
        return d >= new Date(startOfDay.getTime() - 29 * 24 * 60 * 60 * 1000);
    }
  }

  const desde = new Date(rango.desde);
  const hasta = new Date(rango.hasta);
  return d >= desde && d <= hasta;
}

function filtrarExpedientes(
  expedientes: Expediente[],
  query: ExpedienteQuery,
): Expediente[] {
  let result = expedientes;

  if (query.search?.trim()) {
    result = result.filter((e) => matchesSearch(e, query.search!.trim()));
  }
  if (query.estado) {
    result = result.filter((e) => e.estado === query.estado);
  }
  if (query.rangoFecha) {
    result = result.filter((e) =>
      matchesRangoFecha(e.fechaCreacion, query.rangoFecha!),
    );
  }
  if (query.documentoFaltante) {
    result = result.filter((e) =>
      e.documentosFaltantes.includes(query.documentoFaltante!),
    );
  }

  return result;
}

// --- Mock data ---

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const MOCK_EXPEDIENTES: Expediente[] = [
  { id: "1", codigo: "EXP-2026-00001", clienteNombre: "Sofía Ramírez", clienteRfc: "RAMS900101ABC", clienteTelefono: "5551234001", clienteCorreo: "sofia@mail.com", fechaCreacion: daysAgo(15), estado: "incompleto_vencido", nextStepPrioritario: "Falta CURP", capturista: "Ana López", documentosFaltantes: ["CURP"], ultimaActividad: daysAgo(5) },
  { id: "2", codigo: "EXP-2026-00002", clienteNombre: "Carlos Hernández", clienteRfc: "HERC880215DEF", clienteTelefono: "5551234002", clienteCorreo: "carlos@mail.com", fechaCreacion: daysAgo(10), estado: "en_validacion", nextStepPrioritario: "Revisar CSF", capturista: "Luis Pérez", documentosFaltantes: [], ultimaActividad: daysAgo(1) },
  { id: "3", codigo: "EXP-2026-00003", clienteNombre: "Mariana Torres", clienteTelefono: "5551234003", clienteCorreo: "mariana@mail.com", fechaCreacion: daysAgo(8), estado: "en_recepcion", nextStepPrioritario: "Esperando INE", capturista: "Diana Cruz", documentosFaltantes: ["INE"], ultimaActividad: daysAgo(2) },
  { id: "4", codigo: "EXP-2026-00004", clienteNombre: "Diego Sánchez", clienteRfc: "SADD950310GHI", clienteTelefono: "5551234004", clienteCorreo: "diego@mail.com", fechaCreacion: daysAgo(7), estado: "en_captura", nextStepPrioritario: "Completar datos", capturista: "Roberto Díaz", documentosFaltantes: ["CSF", "comprobante"], ultimaActividad: daysAgo(1) },
  { id: "5", codigo: "EXP-2026-00005", clienteNombre: "Valeria Gómez", clienteTelefono: "5551234005", clienteCorreo: "valeria@mail.com", fechaCreacion: daysAgo(5), estado: "completo", nextStepPrioritario: "Listo para cierre", capturista: "Ana López", documentosFaltantes: [], ultimaActividad: daysAgo(0) },
  { id: "6", codigo: "EXP-2026-00006", clienteNombre: "Fernando Reyes", clienteRfc: "REYF870520JKL", clienteTelefono: "5551234006", clienteCorreo: "fernando@mail.com", fechaCreacion: daysAgo(20), estado: "incompleto_vencido", nextStepPrioritario: "Comprobante vencido", capturista: "Luis Pérez", documentosFaltantes: ["comprobante"], ultimaActividad: daysAgo(8) },
  { id: "7", codigo: "EXP-2026-00007", clienteNombre: "Laura Mendoza", clienteTelefono: "5551234007", clienteCorreo: "laura@mail.com", fechaCreacion: daysAgo(12), estado: "cancelado", nextStepPrioritario: "—", capturista: "Diana Cruz", documentosFaltantes: [], ultimaActividad: daysAgo(12) },
  { id: "8", codigo: "EXP-2026-00008", clienteNombre: "Ricardo Navarro", clienteRfc: "NAVR910715MNO", clienteTelefono: "5551234008", clienteCorreo: "ricardo@mail.com", fechaCreacion: daysAgo(6), estado: "en_validacion", nextStepPrioritario: "Verificar INE", capturista: "Roberto Díaz", documentosFaltantes: [], ultimaActividad: daysAgo(0) },
  { id: "9", codigo: "EXP-2026-00009", clienteNombre: "Patricia Flores", clienteTelefono: "5551234009", clienteCorreo: "patricia@mail.com", fechaCreacion: daysAgo(4), estado: "en_recepcion", nextStepPrioritario: "Esperando CURP y CSF", capturista: "Ana López", documentosFaltantes: ["CURP", "CSF"], ultimaActividad: daysAgo(0) },
  { id: "10", codigo: "EXP-2026-00010", clienteNombre: "Andrés Castillo", clienteRfc: "CASA880930PQR", clienteTelefono: "5551234010", clienteCorreo: "andres@mail.com", fechaCreacion: daysAgo(30), estado: "archivado", nextStepPrioritario: "—", capturista: "Luis Pérez", documentosFaltantes: [], ultimaActividad: daysAgo(30) },
  { id: "11", codigo: "EXP-2026-00011", clienteNombre: "Gabriela Ortiz", clienteTelefono: "5551234011", clienteCorreo: "gabriela@mail.com", fechaCreacion: daysAgo(3), estado: "en_captura", nextStepPrioritario: "Falta INE", capturista: "Diana Cruz", documentosFaltantes: ["INE"], ultimaActividad: daysAgo(0) },
  { id: "12", codigo: "EXP-2026-00012", clienteNombre: "Miguel Vargas", clienteRfc: "VARM920405STU", clienteTelefono: "5551234012", clienteCorreo: "miguel@mail.com", fechaCreacion: daysAgo(18), estado: "incompleto_vencido", nextStepPrioritario: "INE rechazada", capturista: "Roberto Díaz", documentosFaltantes: ["INE"], ultimaActividad: daysAgo(10) },
  { id: "13", codigo: "EXP-2026-00013", clienteNombre: "Isabel Moreno", clienteTelefono: "5551234013", clienteCorreo: "isabel@mail.com", fechaCreacion: daysAgo(2), estado: "en_recepcion", nextStepPrioritario: "Esperando comprobante", capturista: "Ana López", documentosFaltantes: ["comprobante"], ultimaActividad: daysAgo(0) },
  { id: "14", codigo: "EXP-2026-00014", clienteNombre: "Javier Luna", clienteRfc: "LUNJ850612VWX", clienteTelefono: "5551234014", clienteCorreo: "javier@mail.com", fechaCreacion: daysAgo(9), estado: "en_validacion", nextStepPrioritario: "Validar comprobante", capturista: "Luis Pérez", documentosFaltantes: [], ultimaActividad: daysAgo(4) },
  { id: "15", codigo: "EXP-2026-00015", clienteNombre: "Carmen Delgado", clienteTelefono: "5551234015", clienteCorreo: "carmen@mail.com", fechaCreacion: daysAgo(1), estado: "en_captura", nextStepPrioritario: "Captura en progreso", capturista: "Diana Cruz", documentosFaltantes: [], ultimaActividad: daysAgo(0) },
  { id: "16", codigo: "EXP-2026-00016", clienteNombre: "Tomás Aguilar", clienteRfc: "AGUT900828YZA", clienteTelefono: "5551234016", clienteCorreo: "tomas@mail.com", fechaCreacion: daysAgo(25), estado: "completo", nextStepPrioritario: "Listo para archivar", capturista: "Roberto Díaz", documentosFaltantes: [], ultimaActividad: daysAgo(1) },
  { id: "17", codigo: "EXP-2026-00017", clienteNombre: "Elena Ríos", clienteTelefono: "5551234017", clienteCorreo: "elena@mail.com", fechaCreacion: daysAgo(14), estado: "en_recepcion", nextStepPrioritario: "Esperando INE y CURP", capturista: "Ana López", documentosFaltantes: ["INE", "CURP"], ultimaActividad: daysAgo(5) },
  { id: "18", codigo: "EXP-2026-00018", clienteNombre: "Roberto Peña", clienteRfc: "PENR870115BCD", clienteTelefono: "5551234018", clienteCorreo: "robertop@mail.com", fechaCreacion: daysAgo(22), estado: "cancelado", nextStepPrioritario: "—", capturista: "Luis Pérez", documentosFaltantes: [], ultimaActividad: daysAgo(20) },
];

const MOCK_HUERFANOS_PENDIENTES = 12;
let mockIdCounter = MOCK_EXPEDIENTES.length + 1;

function generateCodigo(): string {
  const year = new Date().getFullYear();
  const seq = String(mockIdCounter).padStart(5, "0");
  return `EXP-${year}-${seq}`;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const MOCK_CHECKLIST: ChecklistItem[] = [
  { tipo: "INE", estado: "validado", documentoId: "doc-1" },
  { tipo: "CURP", estado: "recibido", documentoId: "doc-2" },
  { tipo: "CSF", estado: "rechazado", documentoId: "doc-3" },
  { tipo: "comprobante", estado: "pendiente" },
];

const MOCK_DOCUMENTOS: Documento[] = [
  {
    id: "doc-1", tipo: "INE", estado: "validado", filename: "ine-frente.jpg",
    archivoUrl: "https://placehold.co/400x600/F5F0EA/989396?text=INE+Frente",
    mimeType: "image/jpeg", canal: "whatsapp", remitente: "Sofía Ramírez",
    fechaRecepcion: new Date(Date.now() - 5 * 86400000).toISOString(),
    datosExtraidos: { "Nombre": "Sofía Ramírez López", "CURP": "RALS900101MDFRPR09", "Vigencia": "2030" },
  },
  {
    id: "doc-2", tipo: "CURP", estado: "recibido", filename: "curp-sofia.pdf",
    archivoUrl: "https://placehold.co/400x600/F5F0EA/989396?text=CURP+PDF",
    mimeType: "application/pdf", canal: "correo", remitente: "sofia@mail.com",
    fechaRecepcion: new Date(Date.now() - 3 * 86400000).toISOString(),
    datosExtraidos: { "CURP": "RALS900101MDFRPR09", "Nombre": "Sofía Ramírez López" },
  },
  {
    id: "doc-3", tipo: "CSF", estado: "rechazado", filename: "csf-sofia.pdf",
    mimeType: "application/pdf", canal: "whatsapp", remitente: "Sofía Ramírez",
    fechaRecepcion: new Date(Date.now() - 2 * 86400000).toISOString(),
    motivoRechazo: { categoria: "vencido", texto: "La constancia tiene más de 3 meses de antigüedad" },
    rechazoAutomatico: true,
  },
  {
    id: "doc-4", tipo: "INE", estado: "reemplazado", filename: "ine-vieja.jpg",
    archivoUrl: "https://placehold.co/400x600/F5F0EA/989396?text=INE+Anterior",
    mimeType: "image/jpeg", canal: "whatsapp", remitente: "Sofía Ramírez",
    fechaRecepcion: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
];

const MOCK_NEXT_STEPS: NextStep[] = [
  { id: "ns-1", texto: "Solicitar nueva CSF al cliente (rechazada por vencimiento)", prioridad: "alta" },
  { id: "ns-2", texto: "Validar CURP recibida", prioridad: "alta" },
  { id: "ns-3", texto: "Solicitar comprobante de domicilio", prioridad: "media" },
  { id: "ns-4", texto: "Revisar datos extraídos de INE", prioridad: "baja" },
];

const MOCK_HISTORIAL: Evento[] = [
  { id: "ev-1", tipo: "expediente_creado", descripcion: "Expediente creado por Ana López", timestamp: new Date(Date.now() - 15 * 86400000).toISOString(), tono: "accent" },
  { id: "ev-2", tipo: "instrucciones_enviadas", descripcion: "Instrucciones enviadas al cliente vía WhatsApp", timestamp: new Date(Date.now() - 14 * 86400000).toISOString(), tono: "neutral" },
  { id: "ev-3", tipo: "documento_recibido", descripcion: "INE recibida vía WhatsApp", timestamp: new Date(Date.now() - 10 * 86400000).toISOString(), tono: "ok" },
  { id: "ev-4", tipo: "documento_reemplazado", descripcion: "INE reemplazada por nueva versión", timestamp: new Date(Date.now() - 5 * 86400000).toISOString(), tono: "neutral" },
  { id: "ev-5", tipo: "documento_validado", descripcion: "INE validada por Ana López", timestamp: new Date(Date.now() - 5 * 86400000).toISOString(), tono: "ok" },
  { id: "ev-6", tipo: "documento_recibido", descripcion: "CURP recibida vía correo", timestamp: new Date(Date.now() - 3 * 86400000).toISOString(), tono: "ok" },
  { id: "ev-7", tipo: "documento_recibido", descripcion: "CSF recibida vía WhatsApp", timestamp: new Date(Date.now() - 2 * 86400000).toISOString(), tono: "ok" },
  { id: "ev-8", tipo: "documento_rechazado", descripcion: "CSF rechazada automáticamente: constancia vencida", timestamp: new Date(Date.now() - 2 * 86400000).toISOString(), tono: "warn" },
  { id: "ev-9", tipo: "recordatorio_enviado", descripcion: "Recordatorio enviado al cliente para CSF y comprobante", timestamp: new Date(Date.now() - 1 * 86400000).toISOString(), tono: "neutral" },
];

const MOCK_NOTAS: Nota[] = [
  { id: "nota-1", texto: "Cliente contactado por teléfono, enviará CSF actualizada esta semana.", autor: "Ana López", timestamp: new Date(Date.now() - 1 * 86400000).toISOString() },
  { id: "nota-2", texto: "Verificar con el cliente si el comprobante puede ser estado de cuenta bancario.", autor: "Luis Pérez", timestamp: new Date(Date.now() - 3 * 86400000).toISOString() },
];

// Swap mock implementations for real API calls via apiClient.
// The signatures (param/return types) MUST NOT change — only the body.
//
// getExpediente    → GET  /api/expedientes/:id → Expediente | null
// createExpediente → POST /api/expedientes  body: CreateExpedienteRequest
//   returns: CreateExpedienteResponse (the full Expediente with server-assigned codigo)
// previewNextCodigo → visual only; real codigo comes from the backend on create
// getExpedientes   → GET  /api/expedientes?search=X&estado=Y&desde=Z&hasta=W&doc_faltante=INE
// getConteos       → GET  /api/expedientes/conteos
// getHuerfanosPendientes → GET /api/huerfanos/count
export const expedientesService = {
  // --- MOCK: replace with apiClient.get<Expediente>(`/expedientes/${id}`) ---
  async getExpediente(id: string): Promise<Expediente | null> {
    await delay(300);
    return MOCK_EXPEDIENTES.find((e) => e.id === id) ?? null;
  },

  // Visual preview only — the real codigo is assigned by the backend on creation.
  previewNextCodigo(): string {
    return generateCodigo();
  },

  async createExpediente(
    req: CreateExpedienteRequest,
  ): Promise<CreateExpedienteResponse> {
    // --- MOCK: replace with apiClient.post<CreateExpedienteResponse>("/expedientes", req) ---
    await delay(800);
    const now = new Date().toISOString();
    const exp: Expediente = {
      id: String(mockIdCounter),
      codigo: generateCodigo(),
      clienteNombre: req.clienteNombre,
      clienteRfc: req.clienteRfc,
      clienteTelefono: req.clienteTelefono,
      clienteCorreo: req.clienteCorreo,
      fechaCreacion: now,
      estado: "en_captura",
      nextStepPrioritario: "Enviar instrucciones al cliente",
      capturista: "Administrador",
      documentosFaltantes: ["INE", "CURP", "CSF", "comprobante"],
      ultimaActividad: now,
    };
    mockIdCounter++;
    MOCK_EXPEDIENTES.push(exp);
    return exp;
  },

  async getExpedientes(query: ExpedienteQuery = {}): Promise<Expediente[]> {
    await delay(400);
    const filtered = filtrarExpedientes(MOCK_EXPEDIENTES, query);
    return ordenarPorPrioridad(filtered);
  },

  async getConteos(): Promise<ConteoEstados> {
    await delay(200);
    const conteos: ConteoEstados = {
      en_captura: 0,
      en_recepcion: 0,
      en_validacion: 0,
      completo: 0,
      incompleto_vencido: 0,
      cancelado: 0,
      archivado: 0,
    };
    for (const exp of MOCK_EXPEDIENTES) {
      conteos[exp.estado]++;
    }
    return conteos;
  },

  async getHuerfanosPendientes(): Promise<number> {
    await delay(100);
    return MOCK_HUERFANOS_PENDIENTES;
  },

  // --- P5 Detail ---
  // GET /api/expedientes/:id/detalle
  async getExpedienteDetalle(id: string): Promise<ExpedienteDetalle | null> {
    await delay(400);
    const exp = MOCK_EXPEDIENTES.find((e) => e.id === id);
    if (!exp) return null;
    return {
      expediente: { ...exp, montoEstimado: 350000, tipoOperacion: "blindaje" as TipoOperacion },
      checklist: MOCK_CHECKLIST,
      documentos: MOCK_DOCUMENTOS,
      nextSteps: MOCK_NEXT_STEPS,
      historial: MOCK_HISTORIAL,
      notas: MOCK_NOTAS,
    };
  },

  // PATCH /api/documentos/:id/validar
  async validarDocumento(docId: string): Promise<Documento> {
    await delay(500);
    return { ...MOCK_DOCUMENTOS.find(d => d.id === docId)!, estado: "validado" };
  },

  // PATCH /api/documentos/:id/rechazar
  async rechazarDocumento(docId: string, motivo: MotivoRechazo): Promise<Documento> {
    await delay(500);
    return { ...MOCK_DOCUMENTOS.find(d => d.id === docId)!, estado: "rechazado", motivoRechazo: motivo };
  },

  // POST /api/documentos/:id/reemplazar
  async reemplazarDocumento(docId: string, _archivo: File): Promise<Documento> {
    await delay(800);
    const old = MOCK_DOCUMENTOS.find(d => d.id === docId)!;
    return { ...old, id: "doc-new-" + Date.now(), estado: "recibido", filename: "reemplazo.pdf", fechaRecepcion: new Date().toISOString(), versionAnterior: { ...old, estado: "reemplazado" as EstadoDocumento } };
  },

  // POST /api/expedientes/:id/documentos
  async subirDocumentoManual(expedienteId: string, tipo: DocumentoRequerido, _archivo: File): Promise<Documento> {
    await delay(800);
    return { id: "doc-manual-" + Date.now(), tipo, estado: "recibido", filename: "documento-manual.pdf", mimeType: "application/pdf", canal: "upload" as Canal, remitente: "Administrador", fechaRecepcion: new Date().toISOString() };
  },

  // PATCH /api/expedientes/:id/completar
  async marcarCompleto(id: string): Promise<Expediente> {
    await delay(500);
    const exp = MOCK_EXPEDIENTES.find(e => e.id === id)!;
    return { ...exp, estado: "completo" as Estado };
  },

  // PATCH /api/expedientes/:id/archivar
  async archivar(id: string): Promise<Expediente> {
    await delay(500);
    const exp = MOCK_EXPEDIENTES.find(e => e.id === id)!;
    return { ...exp, estado: "archivado" as Estado };
  },

  // PATCH /api/expedientes/:id/cancelar
  async cancelarExpediente(id: string, _motivo: string): Promise<Expediente> {
    await delay(500);
    const exp = MOCK_EXPEDIENTES.find(e => e.id === id)!;
    return { ...exp, estado: "cancelado" as Estado };
  },

  // POST /api/expedientes/:id/reenviar-instrucciones
  async reenviarInstrucciones(_id: string): Promise<void> {
    await delay(600);
  },

  // POST /api/expedientes/:id/notas
  async agregarNota(_expedienteId: string, texto: string): Promise<Nota> {
    await delay(300);
    return { id: "nota-" + Date.now(), texto, autor: "Administrador", timestamp: new Date().toISOString() };
  },

  // POST /api/expedientes/:id/consulta-llm
  async consultarLLM(_expedienteId: string, pregunta: string): Promise<ConsultaLLM> {
    await delay(1200);
    const esSAT = pregunta.includes("SAT");
    return {
      id: "llm-" + Date.now(),
      pregunta,
      respuesta: esSAT ? "si" : "no",
      razon: esSAT ? "El monto supera el umbral de identificación para blindaje según la LFPIORPI." : "El monto y tipo de operación permiten pago en efectivo sin restricción.",
      disclaimer: "Respuesta orientativa. Decisión final del Representante de Cumplimiento.",
    };
  },
};
