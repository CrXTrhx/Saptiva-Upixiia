import { Shield, Car, Layers, type LucideIcon } from "lucide-react";
import type { TipoOperacionResumen } from "./types";

// Icono (lucide, no emoji) por tipo de operación. Se usa para diferenciar de un
// vistazo blindajes de ventas de vehículo en el editor de operaciones y en la
// ficha del expediente.
//   ARMORING     → Shield (blindaje)
//   VEHICLE_SALE → Car    (venta de vehículo)
//   MIXED        → Layers (resumen de una venta con tipos mezclados)
export const TIPO_OPERACION_ICONO: Record<TipoOperacionResumen, LucideIcon> = {
  ARMORING: Shield,
  VEHICLE_SALE: Car,
  MIXED: Layers,
};
