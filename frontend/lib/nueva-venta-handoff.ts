// Handoff en memoria para prellenar P3 (Nueva Venta) desde P6 (Cola de Huérfanos).
//
// En React Router esto sería navigate("/nueva-venta", { state: { prefill } }).
// Next.js App Router no transporta estado por navegación, y el proyecto prohíbe
// localStorage/sessionStorage → usamos un singleton de módulo en memoria. Sobrevive
// a router.push (navegación cliente, sin recarga) y se consume una sola vez.

export type DocumentoOrigen = {
  id: string;
  archivo: string;
  tipoDetectado: string;
  canal: string;
  remitente: string;
  timestamp: string;
  datosExtraidos: Record<string, unknown> | null;
};

export type NuevaVentaPrefill = {
  nombreCliente: string;
  telefono: string;
  correo: string;
  rfc: string;
  tipoOperacion: string;
  montoEstimado: string;
  documentoOrigen: DocumentoOrigen;
};

let pending: NuevaVentaPrefill | null = null;

export function setNuevaVentaPrefill(prefill: NuevaVentaPrefill) {
  pending = prefill;
}

// Lee sin consumir (seguro para inicializadores de useState / StrictMode).
export function peekNuevaVentaPrefill(): NuevaVentaPrefill | null {
  return pending;
}

export function clearNuevaVentaPrefill() {
  pending = null;
}
