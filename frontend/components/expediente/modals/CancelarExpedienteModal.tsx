"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type CancelarExpedienteModalProps = {
  onConfirm: (motivo: string) => void;
  onClose: () => void;
  loading: boolean;
};

export default function CancelarExpedienteModal({
  onConfirm,
  onClose,
  loading,
}: CancelarExpedienteModalProps) {
  const [motivo, setMotivo] = useState("");

  function handleConfirm() {
    const trimmed = motivo.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  }

  return (
    <Modal open onClose={onClose} title="Cancelar expediente">
      <div className="flex flex-col gap-4">
        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Esta acción no se puede deshacer. El expediente pasará al estado
          &quot;cancelado&quot; y no podrá recibir más documentos.
        </p>

        {/* Motivo textarea */}
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Motivo de cancelación
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Describe el motivo de la cancelación..."
            rows={3}
            className="w-full rounded-lg border px-3.5 py-2.5 text-sm resize-none focus:outline-2 focus:outline-offset-0 focus:outline-[var(--color-accent)]"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-text)",
              backgroundColor: "var(--color-surface)",
            }}
          />
        </div>

        {/* Confirm button */}
        <Button
          variant="primary"
          onClick={handleConfirm}
          disabled={!motivo.trim()}
          loading={loading}
          className="w-full !bg-[var(--color-error)] hover:!bg-[var(--color-error)]"
        >
          <Ban size={15} />
          Cancelar expediente
        </Button>
      </div>
    </Modal>
  );
}
