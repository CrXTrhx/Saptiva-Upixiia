import { apiClient } from "@/lib/apiClient";

// Shape que devuelve el backend en /huerfanos (serialize_orphan).
export type OrphanDocumento = {
  id: string;
  archivoUrl?: string;
  filename: string;
  mimeType: string;
  canal: string; // WHATSAPP | EMAIL | DIRECT_UPLOAD
  remitente: string;
  textoMensaje: string;
  fechaRecepcion: string;
  datosExtraidos?: Record<string, string> | null;
  tipoSugerido?: string | null; // OFFICIAL_ID | CURP | TAX_STATUS_CERT | PROOF_OF_ADDRESS | null
  expedienteSugerido?: { id: string; codigo: string; clienteNombre: string } | null;
  estado: string; // PENDING | ASSIGNED | DISCARDED
};

export const huerfanosService = {
  async listar(): Promise<OrphanDocumento[]> {
    return apiClient<OrphanDocumento[]>("/huerfanos");
  },

  async count(): Promise<number> {
    const data = await apiClient<{ count: number }>("/huerfanos/count");
    return data.count;
  },

  // Asigna el huérfano a un expediente existente. `tipo` es el código de tipo de
  // documento (en inglés) con el que se declara al asignar.
  async asignar(
    orphanId: string,
    expedienteId: string,
    tipo?: string | null,
  ): Promise<void> {
    await apiClient<unknown>(`/huerfanos/${orphanId}/asignar`, {
      method: "POST",
      body: JSON.stringify({ expedienteId, tipo: tipo ?? null }),
    });
  },

  async descartar(orphanId: string, motivo: string): Promise<void> {
    await apiClient<void>(`/huerfanos/${orphanId}/descartar`, {
      method: "POST",
      body: JSON.stringify({ motivo }),
    });
  },
};
