"use client";

import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import OrphanQueuePage from "@/components/huerfanos/OrphanQueuePage";
import { setNuevaVentaPrefill } from "@/lib/nueva-venta-handoff";

export default function HuerfanosPage() {
  const router = useRouter();

  return (
    <ProtectedRoute>
      <OrphanQueuePage
        onVolverDashboard={() => router.push("/dashboard")}
        onCrearExpediente={(prefill) => {
          // Handoff en memoria → P3 lo consume al montar.
          setNuevaVentaPrefill(prefill);
          router.push("/nueva-venta");
        }}
        onIrAlExpediente={(exp) => {
          // Tras asignar, navegar al detalle del expediente (P5).
          if (exp?.id) router.push(`/expedientes/${exp.id}`);
        }}
      />
    </ProtectedRoute>
  );
}
