import { apiClient, apiUpload } from "@/lib/apiClient";
import type {
  ClienteAgrupado,
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
  previewNextCodigo(): string {
    const year = new Date().getFullYear();
    return `EXP-${year}-XXXXX`;
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
      montoEstimado: number;
      tipoOperacion: TipoOperacion;
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

  // Vista "Por cliente": agrupa los expedientes (ya filtrados por el backend) por
  // cliente, ordena cada grupo por prioridad y los clientes por su urgencia máxima.
  async getClientesAgrupados(
    query: ExpedienteQuery = {},
  ): Promise<ClienteAgrupado[]> {
    const filtered = await apiClient<Expediente[]>(
      `/expedientes${buildQueryString(query)}`,
    );

    // Agrupar por identidad de cliente (el teléfono es estable).
    const grupos = new Map<string, Expediente[]>();
    for (const exp of filtered) {
      const key = exp.clienteTelefono || exp.clienteCorreo || exp.id;
      const arr = grupos.get(key);
      if (arr) arr.push(exp);
      else grupos.set(key, [exp]);
    }

    const clientes: ClienteAgrupado[] = [];
    for (const [key, exps] of grupos) {
      const expedientes = ordenarPorPrioridad(exps);
      const head = expedientes[0];

      const conteoPorEstado: Partial<Record<Estado, number>> = {};
      for (const e of exps) {
        conteoPorEstado[e.estado] = (conteoPorEstado[e.estado] ?? 0) + 1;
      }

      clientes.push({
        id: key,
        nombre: head.clienteNombre,
        telefono: head.clienteTelefono,
        correo: head.clienteCorreo,
        rfc: head.clienteRfc,
        montoTotal: exps.reduce((sum, e) => sum + (e.montoEstimado ?? 0), 0),
        totalExpedientes: exps.length,
        conteoPorEstado,
        tieneUrgente: exps.some((e) => calcularPrioridad(e) === 0),
        expedientes,
      });
    }

    return clientes.sort((a, b) => {
      const pa = Math.min(...a.expedientes.map(calcularPrioridad));
      const pb = Math.min(...b.expedientes.map(calcularPrioridad));
      if (pa !== pb) return pa - pb;
      return b.montoTotal - a.montoTotal;
    });
  },

  async getConteos(): Promise<ConteoEstados> {
    return apiClient<ConteoEstados>("/expedientes/conteos");
  },

  async getHuerfanosPendientes(): Promise<number> {
    const data = await apiClient<{ count: number }>("/huerfanos/count");
    return data.count;
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

  async cancelarExpediente(id: string, motivo: string): Promise<Expediente> {
    return apiClient<Expediente>(`/expedientes/${id}/cancelar`, {
      method: "PATCH",
      body: JSON.stringify({ motivo }),
    });
  },

  async reenviarInstrucciones(id: string): Promise<void> {
    await apiClient<void>(`/expedientes/${id}/reenviar-instrucciones`, {
      method: "POST",
    });
  },

  // Vista previa del correo de instrucciones (la arma el backend): destinatario,
  // remitente, asunto y cuerpo (con los documentos pendientes y su motivo). La usa
  // el menú "Reenviar instrucciones" (panel de correo + "Copiar instrucciones").
  async getInstrucciones(id: string): Promise<InstruccionesPreview> {
    return apiClient<InstruccionesPreview>(`/expedientes/${id}/instrucciones`);
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
