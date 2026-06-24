import type { TipoOperacion } from "./types";

export const UMBRALES_IDENTIFICACION: Record<TipoOperacion, number> = {
  blindaje: 282_717.1,
  venta_vehiculo: 376_565.1,
};

export const TIPO_OPERACION_LABELS: Record<TipoOperacion, string> = {
  blindaje: "Blindaje",
  venta_vehiculo: "Venta de vehículo",
};

export const TIPO_OPERACION_FRACCION: Record<TipoOperacion, string> = {
  blindaje: "Fracción IX",
  venta_vehiculo: "Fracción VIII",
};

export function requiereIdentificacion(
  monto: number,
  tipo: TipoOperacion,
): boolean {
  return monto >= UMBRALES_IDENTIFICACION[tipo];
}

// La validación legal definitiva la hará el backend.
