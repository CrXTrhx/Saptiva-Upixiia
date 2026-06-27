"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { ContadoresEstado } from "@/components/dashboard/ContadoresEstado";
import { FiltrosBusqueda } from "@/components/dashboard/FiltrosBusqueda";
import { TablaExpedientes } from "@/components/dashboard/TablaExpedientes";
import { TablaClientes } from "@/components/dashboard/TablaClientes";
import { VistaToggle, type VistaDashboard } from "@/components/dashboard/VistaToggle";
import ClienteDetalle from "@/components/dashboard/ClienteDetalle";
import { expedientesService, agruparPorCliente } from "@/services/expedientesService";
import type {
  ClienteAgrupado,
  ConteoEstados,
  Expediente,
  ExpedienteQuery,
} from "@/lib/types";

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const router = useRouter();
  const [conteos, setConteos] = useState<ConteoEstados | null>(null);
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [huerfanos, setHuerfanos] = useState<number | null>(null);
  const [query, setQuery] = useState<ExpedienteQuery>({});
  const [activeView, setActiveView] = useState<VistaDashboard>("cliente");
  const [selectedCliente, setSelectedCliente] = useState<ClienteAgrupado | null>(null);
  const [loadingConteos, setLoadingConteos] = useState(true);
  const [loadingTable, setLoadingTable] = useState(true);

  // Conteos + huérfanos pendientes en UNA sola request (antes eran 2).
  useEffect(() => {
    expedientesService.getDashboardResumen().then((r) => {
      setConteos(r.conteos);
      setHuerfanos(r.huerfanosPendientes);
      setLoadingConteos(false);
    });
  }, []);

  // Un solo fetch de la lista por `query`. La vista "Por cliente" se deriva en memoria
  // (agruparPorCliente), así alternar de vista NO vuelve a pedir datos al backend.
  useEffect(() => {
    let cancelled = false;
    setLoadingTable(true);

    expedientesService.getExpedientes(query).then((data) => {
      if (cancelled) return;
      setExpedientes(data);
      setLoadingTable(false);
    });

    return () => {
      cancelled = true;
    };
  }, [query]);

  const clientes = useMemo(() => agruparPorCliente(expedientes), [expedientes]);

  const handleQueryChange = useCallback((next: ExpedienteQuery) => {
    setQuery(next);
  }, []);

  const handleViewChange = useCallback((view: VistaDashboard) => {
    setActiveView(view);
  }, []);

  const handleSelectCliente = useCallback((cliente: ClienteAgrupado) => {
    setSelectedCliente(cliente);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedCliente(null);
  }, []);

  const hasFilters = !!(
    query.search ||
    query.estado ||
    query.rangoFecha ||
    query.documentoFaltante
  );

  // P-Cliente: al seleccionar un cliente (modo "Por cliente") se reemplaza el
  // dashboard por la pantalla completa de detalle del cliente (antes era un modal
  // pequeño). Los datos ya están en memoria (selectedCliente.expedientes); no hay
  // fetch. Las navegaciones a P5 (expediente) y P3 (nueva venta) se reusan aquí.
  if (selectedCliente) {
    return (
      <ClienteDetalle
        cliente={selectedCliente}
        expedientes={selectedCliente.expedientes}
        onBack={handleCloseModal}
        onAbrirExpediente={(exp) => router.push(`/expedientes/${exp.id}`)}
        onNuevaVenta={() => router.push("/nueva-venta")}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <DashboardHeader huerfanosPendientes={huerfanos} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-6 space-y-6">
        <ContadoresEstado conteos={conteos} loading={loadingConteos} />
        <FiltrosBusqueda query={query} onChange={handleQueryChange} />

        <div className="flex items-center justify-between gap-3">
          <VistaToggle value={activeView} onChange={handleViewChange} />
          <p className="hidden text-xs text-[var(--color-muted)] sm:block">
            {activeView === "cliente"
              ? "Agrupado por cliente · ordenado por urgencia"
              : "Expedientes individuales · ordenados por prioridad"}
          </p>
        </div>

        {activeView === "cliente" ? (
          <TablaClientes
            clientes={clientes}
            loading={loadingTable}
            hasFilters={hasFilters}
            onSelectCliente={handleSelectCliente}
          />
        ) : (
          <TablaExpedientes
            expedientes={expedientes}
            loading={loadingTable}
            hasFilters={hasFilters}
          />
        )}
      </main>
    </div>
  );
}
