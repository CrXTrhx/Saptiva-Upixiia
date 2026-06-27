import type { TipoOperacion } from "./types";

export const UMBRALES_IDENTIFICACION: Record<TipoOperacion, number> = {
  ARMORING: 282_717.1,
  VEHICLE_SALE: 376_565.1,
};

export const TIPO_OPERACION_LABELS: Record<TipoOperacion, string> = {
  ARMORING: "Blindaje",
  VEHICLE_SALE: "Venta de vehículo",
};

export const TIPO_OPERACION_FRACCION: Record<TipoOperacion, string> = {
  ARMORING: "Fracción IX",
  VEHICLE_SALE: "Fracción VIII",
};

export function requiereIdentificacion(
  monto: number,
  tipo: TipoOperacion,
): boolean {
  return monto >= UMBRALES_IDENTIFICACION[tipo];
}

// La validación legal definitiva la hará el backend.
