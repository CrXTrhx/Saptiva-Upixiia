"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function ExpedienteDetallePage() {
  const params = useParams();
  return (
    <ProtectedRoute>
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">
          Detalle de Expediente
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          ID: {params.id} — P5 Próximamente
        </p>
        <Link
          href="/dashboard"
          className="text-sm text-[var(--color-accent)] hover:underline"
        >
          Volver al Dashboard
        </Link>
      </div>
    </ProtectedRoute>
  );
}
