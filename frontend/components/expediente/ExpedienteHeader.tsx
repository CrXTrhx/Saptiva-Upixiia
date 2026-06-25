"use client";

import { useState } from "react";
import { Phone, Mail, Send, Ban, Archive } from "lucide-react";
import type { Expediente, TipoOperacion } from "@/lib/types";
import { TIPO_OPERACION_LABELS } from "@/lib/reglas-negocio";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";

type ExpedienteHeaderProps = {
  expediente: Expediente & { montoEstimado: number; tipoOperacion: TipoOperacion };
  onCancelar: () => void;
  onReenviar: () => void;
  onArchivar: () => void;
};

function DataField({
  label,
  value,
  icon,
  mono,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="uppercase text-[10px] tracking-wider font-medium"
        style={{ color: "var(--color-tertiary)" }}
      >
        {label}
      </span>
      <span
        className={`text-sm flex items-center gap-1.5 ${mono ? "font-mono" : ""}`}
        style={{ color: "var(--color-text)" }}
      >
        {icon}
        {value}
      </span>
    </div>
  );
}

export default function ExpedienteHeader({
  expediente,
  onCancelar,
  onReenviar,
  onArchivar,
}: ExpedienteHeaderProps) {
  const [reenviarLoading, setReenviarLoading] = useState(false);

  async function handleReenviar() {
    setReenviarLoading(true);
    try {
      onReenviar();
    } finally {
      setReenviarLoading(false);
    }
  }

  const montoFormateado = expediente.montoEstimado.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });

  const fechaCreacion = new Date(expediente.fechaCreacion).toLocaleDateString(
    "es-MX",
    { day: "2-digit", month: "short", year: "numeric" }
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Top row: code + status + actions */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <span
              className="text-2xl font-mono tabular-nums font-semibold"
              style={{ color: "var(--color-text)" }}
            >
              {expediente.codigo}
            </span>
            <StatusBadge estado={expediente.estado} />
          </div>
          <span
            className="text-lg font-medium"
            style={{ color: "var(--color-text)" }}
          >
            {expediente.clienteNombre}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            loading={reenviarLoading}
            onClick={handleReenviar}
          >
            <Send size={15} />
            Reenviar instrucciones
          </Button>
          <Button
            variant="secondary"
            onClick={onCancelar}
            className="!text-[var(--color-error)] !border-[var(--color-error)] hover:!bg-[var(--color-error-bg)]"
          >
            <Ban size={15} />
            Cancelar expediente
          </Button>
          {expediente.estado === "COMPLETE" && (
            <Button variant="secondary" onClick={onArchivar}>
              <Archive size={15} />
              Archivar
            </Button>
          )}
        </div>
      </div>

      {/* Data fields grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        <DataField
          label="Teléfono"
          value={expediente.clienteTelefono}
          icon={<Phone size={13} style={{ color: "var(--color-muted)" }} />}
        />
        <DataField
          label="Correo"
          value={expediente.clienteCorreo}
          icon={<Mail size={13} style={{ color: "var(--color-muted)" }} />}
        />
        <DataField
          label="RFC"
          value={expediente.clienteRfc ?? "—"}
          mono
        />
        <DataField
          label="Monto"
          value={montoFormateado}
        />
        <DataField
          label="Tipo de operación"
          value={TIPO_OPERACION_LABELS[expediente.tipoOperacion]}
        />
        <DataField
          label="Fecha creación"
          value={fechaCreacion}
        />
        <DataField
          label="Capturista"
          value={expediente.capturista}
        />
      </div>
    </div>
  );
}
