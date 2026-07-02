import { apiClient, apiUpload } from "@/lib/apiClient";
import type {
  ClienteResumen,
  RfcSugerencia,
  ConteoEstados,
  CreateExpedienteRequest,
  CreateExpedienteResponse,
  Expediente,
  ExpedienteQuery,
  Estado,
  ExpedienteDetalle,
  Documento,
  Nota,
  ConsultaLLM,
  MotivoRechazo,
  DocumentoRequerido,
  TipoOperacion,
  Operacion,
} from "@/lib/types";

// Vista previa del correo de instrucciones que arma el backend (GET /instrucciones).
export type InstruccionesPreview = {
  codigo: string;
  destinatario: string; // correo del cliente registrado en el expediente
  remitente: string; // remitente configurado (MAIL_FROM)
  asunto: string;
  texto: string; // cuerpo: instrucciones + documentos pendientes y su motivo
};

// --- Priority sort (business rule: urgents first, then validation, then missing docs, then rest) ---
// El backend ya ordena la lista por prioridad; estos helpers se reutilizan para la
// vista "Por cliente", que se agrupa en el cliente porque el backend no la expone.

const INACTIVIDAD_MS = 3 * 24 * 60 * 60 * 1000;

const ESTADO_PRIORIDAD: Record<Estado, number> = {
  INCOMPLETE_EXPIRED: 0,
  IN_VALIDATION: 1,
  RECEIVING: 2,
  CAPTURING: 3,
  COMPLETE: 4,
  CANCELLED: 5,
  ARCHIVED: 5,
};

function calcularPrioridad(exp: Expediente): number {
  const inactivo =
    Date.now() - new Date(exp.ultimaActividad).getTime() > INACTIVIDAD_MS;

  // Inactivos >3 days get bumped to urgent tier — but only for active states, not terminal ones
  if (
    inactivo &&
    exp.estado !== "CANCELLED" &&
    exp.estado !== "ARCHIVED" &&
    exp.estado !== "COMPLETE" &&
    exp.estado !== "INCOMPLETE_EXPIRED"
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

// --- Query string para el listado del backend ---

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function buildQueryString(query: ExpedienteQuery): string {
  const params = new URLSearchParams();
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.estado) params.set("estado", query.estado);
  if (query.documentoFaltante)
    params.set("doc_faltante", query.documentoFaltante);

  if (query.rangoFecha) {
    if ("preset" in query.rangoFecha) {
      const hoy = startOfDay(new Date());
      let desde = hoy;
      if (query.rangoFecha.preset === "7dias")
        desde = new Date(hoy.getTime() - 6 * 24 * 60 * 60 * 1000);
      else if (query.rangoFecha.preset === "30dias")
        desde = new Date(hoy.getTime() - 29 * 24 * 60 * 60 * 1000);
      params.set("desde", desde.toISOString());
    } else {
      params.set("desde", new Date(query.rangoFecha.desde).toISOString());
      params.set("hasta", new Date(query.rangoFecha.hasta).toISOString());
    }
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const expedientesService = {
  async getExpediente(id: string): Promise<Expediente | null> {
    try {
      return await apiClient<Expediente>(`/expedientes/${id}`);
    } catch {
      return null;
    }
  },

  // Vista previa visual del código; el real lo asigna el backend al crear.
  // Formato: EXP-AAAA-{BLN|VNT|MIX}{NNNNN}-{XXXX}. El consecutivo (NNNNN) y los 4
  // caracteres aleatorios (XXXX) los asigna el backend, así que aquí van como
  // marcadores. El prefijo se deriva de los tipos seleccionados: MIX si hay más de
  // un tipo distinto, si no BLN/VNT.
  previewNextCodigo(tipos: Array<TipoOperacion | "">): string {
    const year = new Date().getFullYear();
    const distintos = Array.from(new Set(tipos.filter(Boolean)));
    let op = "···";
    if (distintos.length > 1) op = "MIX";
    else if (distintos[0] === "ARMORING") op = "BLN";
    else if (distintos[0] === "VEHICLE_SALE") op = "VNT";
    return `EXP-${year}-${op}#####-XXXX`;
  },

  async createExpediente(
    req: CreateExpedienteRequest,
  ): Promise<CreateExpedienteResponse> {
    return apiClient<CreateExpedienteResponse>("/expedientes", {
      method: "POST",
      body: JSON.stringify(req),
    });
  },

  async actualizarExpediente(
    id: string,
    datos: {
      clienteNombre: string;
      clienteTelefono: string;
      clienteCorreo: string;
      clienteRfc?: string;
      operaciones: Operacion[];
    },
  ): Promise<Expediente> {
    return apiClient<Expediente>(`/expedientes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(datos),
    });
  },

  async getExpedientes(query: ExpedienteQuery = {}): Promise<Expediente[]> {
    const data = await apiClient<Expediente[]>(
      `/expedientes${buildQueryString(query)}`,
    );
    return ordenarPorPrioridad(data);
  },

  // Vista "Por prioridad" paginada en el servidor. Cada respuesta incluye los
  // elementos de la página y el total filtrado para el botón "Ver más".
  async getExpedientesPagina(
    query: ExpedienteQuery = {},
    limit = 20,
    offset = 0,
  ): Promise<{ items: Expediente[]; total: number }> {
    const qs = buildQueryString(query);
    const separator = qs ? "&" : "?";
    return apiClient<{ items: Expediente[]; total: number }>(
      `/expedientes/pagina${qs}${separator}limit=${limit}&offset=${offset}`,
    );
  },

  // --- Carga por pasos (optimización) -------------------------------------
  // Paso 1: lista COMPACTA de clientes (uno por RFC) ya agregada por el backend.
  // No descarga todos los expedientes: el navegador solo recibe N filas de cliente.
  // Acepta los mismos filtros que la lista de expedientes (search/estado/fecha/doc).
  async getClientes(query: ExpedienteQuery = {}): Promise<ClienteResumen[]> {
    return apiClient<ClienteResumen[]>(`/clientes${buildQueryString(query)}`);
  },

  // Paso 2: expedientes ACTIVOS de UN cliente (al hacer clic). `clave` es el RFC o,
  // si es un cliente legacy sin RFC, el id del expediente. NO incluye archivados (el
  // backend los excluye por defecto): esos se piden aparte y bajo demanda.
  async getExpedientesDeCliente(clave: string): Promise<Expediente[]> {
    const data = await apiClient<Expediente[]>(
      `/clientes/${encodeURIComponent(clave)}/expedientes`,
    );
    return ordenarPorPrioridad(data);
  },

  // Expedientes ARCHIVADOS de un cliente (carga diferida: solo al abrir la sección
  // "Archivados" del detalle). El backend ya los ordena del más reciente al más
  // antiguo, así que aquí NO se reordena por prioridad.
  async getExpedientesArchivadosDeCliente(clave: string): Promise<Expediente[]> {
    return apiClient<Expediente[]>(
      `/clientes/${encodeURIComponent(clave)}/expedientes?archivados=true`,
    );
  },

  // Autocompletado de RFC en el form de nueva venta: clientes cuyo RFC empieza
  // con el prefijo escrito.
  async getSugerenciasRfc(prefix: string): Promise<RfcSugerencia[]> {
    const p = prefix.trim();
    if (p.length < 2) return [];
    return apiClient<RfcSugerencia[]>(
      `/clientes/sugerencias?rfc=${encodeURIComponent(p)}`,
    );
  },

  async getConteos(): Promise<ConteoEstados> {
    return apiClient<ConteoEstados>("/expedientes/conteos");
  },

  async getHuerfanosPendientes(): Promise<number> {
    const data = await apiClient<{ count: number }>("/huerfanos/count");
    return data.count;
  },

  // Resumen del dashboard: conteos + huérfanos pendientes en UNA sola request
  // (antes eran 2 llamadas separadas en la carga inicial).
  async getDashboardResumen(): Promise<{
    conteos: ConteoEstados;
    huerfanosPendientes: number;
  }> {
    return apiClient<{ conteos: ConteoEstados; huerfanosPendientes: number }>(
      "/dashboard/resumen",
    );
  },

  // --- P5 Detail ---
  async getExpedienteDetalle(id: string): Promise<ExpedienteDetalle | null> {
    try {
      return await apiClient<ExpedienteDetalle>(`/expedientes/${id}/detalle`);
    } catch {
      return null;
    }
  },

  async validarDocumento(docId: string): Promise<Documento> {
    return apiClient<Documento>(`/documentos/${docId}/validar`, {
      method: "PATCH",
    });
  },

  async rechazarDocumento(
    docId: string,
    motivo: MotivoRechazo,
  ): Promise<Documento> {
    return apiClient<Documento>(`/documentos/${docId}/rechazar`, {
      method: "PATCH",
      body: JSON.stringify({ categoria: motivo.categoria, texto: motivo.texto }),
    });
  },

  // Descarta un documento rechazado (sale del flujo activo, se conserva en "Descartados").
  async descartarDocumento(docId: string): Promise<Documento> {
    return apiClient<Documento>(`/documentos/${docId}/descartar`, {
      method: "PATCH",
    });
  },

  // Restaura un documento descartado: vuelve a estado "rechazado".
  async restaurarDescartado(docId: string): Promise<Documento> {
    return apiClient<Documento>(`/documentos/${docId}/restaurar-descartado`, {
      method: "PATCH",
    });
  },

  async reemplazarDocumento(docId: string, archivo: File): Promise<Documento> {
    const form = new FormData();
    form.append("file", archivo);
    return apiUpload<Documento>(`/documentos/${docId}/reemplazar`, form, "POST");
  },

  // Restaura la versión anterior de un documento reemplazado: el documento
  // vigente vuelve al histórico y el anterior queda activo (devuelve el activo).
  async restaurarVersion(docId: string): Promise<Documento> {
    return apiClient<Documento>(`/documentos/${docId}/restaurar-version`, {
      method: "POST",
    });
  },

  async subirDocumentoManual(
    expedienteId: string,
    tipo: DocumentoRequerido,
    archivo: File,
  ): Promise<Documento> {
    const form = new FormData();
    form.append("tipo", tipo);
    form.append("file", archivo);
    return apiUpload<Documento>(
      `/expedientes/${expedienteId}/documentos`,
      form,
      "POST",
    );
  },

  async marcarCompleto(id: string): Promise<Expediente> {
    return apiClient<Expediente>(`/expedientes/${id}/completar`, {
      method: "PATCH",
    });
  },

  async archivar(id: string): Promise<Expediente> {
    return apiClient<Expediente>(`/expedientes/${id}/archivar`, {
      method: "PATCH",
    });
  },

  async desarchivar(id: string): Promise<Expediente> {
    return apiClient<Expediente>(`/expedientes/${id}/desarchivar`, {
      method: "PATCH",
    });
  },

  async cancelarExpediente(id: string, motivo: string): Promise<Expediente> {
    return apiClient<Expediente>(`/expedientes/${id}/cancelar`, {
      method: "PATCH",
      body: JSON.stringify({ motivo }),
    });
  },

  async reenviarInstrucciones(
    id: string,
  ): Promise<{ enviado: boolean; correo: string }> {
    return apiClient<{ enviado: boolean; correo: string }>(
      `/expedientes/${id}/reenviar-instrucciones`,
      { method: "POST" },
    );
  },

  async restaurarExpediente(id: string): Promise<Expediente> {
    return apiClient<Expediente>(`/expedientes/${id}/restaurar`, {
      method: "PATCH",
    });
  },

  async getInstrucciones(id: string): Promise<{
    codigo: string;
    whatsapp: string;
    correo: string;
    texto: string;
    remitente: string;
    destinatario: string;
    asunto: string;
  }> {
    return apiClient<{
      codigo: string;
      whatsapp: string;
      correo: string;
      texto: string;
      remitente: string;
      destinatario: string;
      asunto: string;
    }>(`/expedientes/${id}/instrucciones`);
  },

  async agregarNota(expedienteId: string, texto: string): Promise<Nota> {
    return apiClient<Nota>(`/expedientes/${expedienteId}/notas`, {
      method: "POST",
      body: JSON.stringify({ texto }),
    });
  },

  async consultarLLM(
    expedienteId: string,
    pregunta: string,
  ): Promise<ConsultaLLM> {
    return apiClient<ConsultaLLM>(`/expedientes/${expedienteId}/consulta-llm`, {
      method: "POST",
      body: JSON.stringify({ pregunta }),
    });
  },
};
