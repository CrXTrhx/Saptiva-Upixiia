import type {
  ClienteAgrupado,
  ConteoEstados,
  CreateExpedienteRequest,
  CreateExpedienteResponse,
  Estado,
  Expediente,
  ExpedienteQuery,
  RangoFecha,
  ExpedienteDetalle,
  Documento,
  NextStep,
  Nota,
  ConsultaLLM,
  MotivoRechazo,
  DocumentoRequerido,
} from "@/lib/types";
import { apiClient } from "@/lib/apiClient";

// --- Helpers ---

function presetToDesde(preset: "hoy" | "7dias" | "30dias"): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = 24 * 60 * 60 * 1000;
  if (preset === "hoy") return start.toISOString();
  if (preset === "7dias") return new Date(start.getTime() - 6 * day).toISOString();
  return new Date(start.getTime() - 29 * day).toISOString();
}

function buildQuery(query: ExpedienteQuery): string {
  const p = new URLSearchParams();
  if (query.search?.trim()) p.set("search", query.search.trim());
  if (query.estado) p.set("estado", query.estado);
  if (query.documentoFaltante) p.set("doc_faltante", query.documentoFaltante);
  if (query.rangoFecha) {
    const r: RangoFecha = query.rangoFecha;
    if ("preset" in r) {
      p.set("desde", presetToDesde(r.preset));
    } else {
      p.set("desde", r.desde);
      p.set("hasta", r.hasta);
    }
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function getOrNull<T>(endpoint: string): Promise<T | null> {
  try {
    return await apiClient<T>(endpoint);
  } catch {
    return null;
  }
}

const ESTADO_PRIORIDAD: Record<Estado, number> = {
  INCOMPLETE_EXPIRED: 0,
  IN_VALIDATION: 1,
  RECEIVING: 2,
  CAPTURING: 3,
  COMPLETE: 4,
  CANCELLED: 5,
  ARCHIVED: 6,
};

function clienteKey(exp: Expediente): string {
  return exp.clienteRfc || exp.clienteTelefono || exp.clienteCorreo || exp.clienteNombre;
}

function compareExpedientes(a: Expediente, b: Expediente): number {
  const pa = ESTADO_PRIORIDAD[a.estado] ?? 99;
  const pb = ESTADO_PRIORIDAD[b.estado] ?? 99;
  if (pa !== pb) return pa - pb;
  return new Date(b.ultimaActividad).getTime() - new Date(a.ultimaActividad).getTime();
}

function agruparPorCliente(expedientes: Expediente[]): ClienteAgrupado[] {
  const grupos = new Map<string, ClienteAgrupado>();

  for (const exp of expedientes) {
    const id = clienteKey(exp);
    const actual = grupos.get(id) ?? {
      id,
      nombre: exp.clienteNombre,
      telefono: exp.clienteTelefono,
      correo: exp.clienteCorreo,
      rfc: exp.clienteRfc,
      montoTotal: 0,
      totalExpedientes: 0,
      conteoPorEstado: {},
      tieneUrgente: false,
      expedientes: [],
    };

    actual.montoTotal += exp.montoEstimado ?? 0;
    actual.totalExpedientes += 1;
    actual.conteoPorEstado[exp.estado] = (actual.conteoPorEstado[exp.estado] ?? 0) + 1;
    actual.tieneUrgente = actual.tieneUrgente || exp.estado === "INCOMPLETE_EXPIRED";
    actual.expedientes.push(exp);
    grupos.set(id, actual);
  }

  return Array.from(grupos.values())
    .map((cliente) => ({
      ...cliente,
      expedientes: [...cliente.expedientes].sort(compareExpedientes),
    }))
    .sort((a, b) => {
      if (a.tieneUrgente !== b.tieneUrgente) return a.tieneUrgente ? -1 : 1;
      const pa = Math.min(...a.expedientes.map((e) => ESTADO_PRIORIDAD[e.estado] ?? 99));
      const pb = Math.min(...b.expedientes.map((e) => ESTADO_PRIORIDAD[e.estado] ?? 99));
      if (pa !== pb) return pa - pb;
      return b.montoTotal - a.montoTotal;
    });
}

// Las firmas (params/retornos) coinciden con lo que consumen las pantallas.
export const expedientesService = {
  async getExpediente(id: string): Promise<Expediente | null> {
    return getOrNull<Expediente>(`/expedientes/${id}`);
  },

  // Preview visual del codigo; el real lo asigna el backend al crear.
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

  async getExpedientes(query: ExpedienteQuery = {}): Promise<Expediente[]> {
    return apiClient<Expediente[]>(`/expedientes${buildQuery(query)}`);
  },

  async getClientesAgrupados(query: ExpedienteQuery = {}): Promise<ClienteAgrupado[]> {
    const expedientes = await apiClient<Expediente[]>(`/expedientes${buildQuery(query)}`);
    return agruparPorCliente(expedientes);
  },

  async getConteos(): Promise<ConteoEstados> {
    return apiClient<ConteoEstados>("/expedientes/conteos");
  },

  async getHuerfanosPendientes(): Promise<number> {
    const r = await apiClient<{ count: number }>("/huerfanos/count");
    return r.count;
  },

  async getExpedienteDetalle(id: string): Promise<ExpedienteDetalle | null> {
    return getOrNull<ExpedienteDetalle>(`/expedientes/${id}/detalle`);
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
      body: JSON.stringify(motivo),
    });
  },

  async reemplazarDocumento(docId: string, archivo: File): Promise<Documento> {
    const fd = new FormData();
    fd.append("file", archivo);
    return apiClient<Documento>(`/documentos/${docId}/reemplazar`, {
      method: "POST",
      body: fd,
    });
  },

  async subirDocumentoManual(
    expedienteId: string,
    tipo: DocumentoRequerido,
    archivo: File,
  ): Promise<Documento> {
    const fd = new FormData();
    fd.append("tipo", tipo);
    fd.append("file", archivo);
    return apiClient<Documento>(`/expedientes/${expedienteId}/documentos`, {
      method: "POST",
      body: fd,
    });
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

// Tipo reexportado por conveniencia (algunas pantallas lo importan de aqui)
export type { NextStep };
