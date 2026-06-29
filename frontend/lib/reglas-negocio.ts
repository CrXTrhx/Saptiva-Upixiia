import type { TipoOperacion, TipoOperacionResumen } from "./types";

// Para "MIXED" usamos el umbral más conservador (el mínimo entre los tipos reales),
// igual que el backend, para errar hacia exigir identificación en ventas mezcladas.
export const UMBRALES_IDENTIFICACION: Record<TipoOperacionResumen, number> = {
  ARMORING: 282_717.1,
  VEHICLE_SALE: 376_565.1,
  MIXED: 282_717.1,
};

export const TIPO_OPERACION_LABELS: Record<TipoOperacionResumen, string> = {
  ARMORING: "Blindaje",
  VEHICLE_SALE: "Venta de vehículo",
  MIXED: "Mixto",
};

export const TIPO_OPERACION_FRACCION: Record<TipoOperacion, string> = {
  ARMORING: "Fracción IX",
  VEHICLE_SALE: "Fracción VIII",
};

export function requiereIdentificacion(
  monto: number,
  tipo: TipoOperacionResumen,
): boolean {
  return monto >= UMBRALES_IDENTIFICACION[tipo];
}

// La validación legal definitiva la hará el backend.
