"use client";

import { useCallback, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { ContadoresEstado } from "@/components/dashboard/ContadoresEstado";
import { FiltrosBusqueda } from "@/components/dashboard/FiltrosBusqueda";
import { TablaExpedientes } from "@/components/dashboard/TablaExpedientes";
import { TablaClientes } from "@/components/dashboard/TablaClientes";
import { ExpedientesClienteModal } from "@/components/dashboard/ExpedientesClienteModal";
import { VistaToggle, type VistaDashboard } from "@/components/dashboard/VistaToggle";
import { expedientesService } from "@/services/expedientesService";
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
  const [conteos, setConteos] = useState<ConteoEstados | null>(null);
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [clientes, setClientes] = useState<ClienteAgrupado[]>([]);
  const [huerfanos, setHuerfanos] = useState<number | null>(null);
  const [query, setQuery] = useState<ExpedienteQuery>({});
  const [activeView, setActiveView] = useState<VistaDashboard>("cliente");
  const [selectedCliente, setSelectedCliente] = useState<ClienteAgrupado | null>(null);
  const [loadingConteos, setLoadingConteos] = useState(true);
  const [loadingTable, setLoadingTable] = useState(true);

  useEffect(() => {
    expedientesService.getConteos().then((c) => {
      setConteos(c);
      setLoadingConteos(false);
    });
    expedientesService.getHuerfanosPendientes().then(setHuerfanos);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingTable(true);

    if (activeView === "cliente") {
      expedientesService.getClientesAgrupados(query).then((data) => {
        if (cancelled) return;
        setClientes(data);
        setLoadingTable(false);
      });
    } else {
      expedientesService.getExpedientes(query).then((data) => {
        if (cancelled) return;
        setExpedientes(data);
        setLoadingTable(false);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [query, activeView]);

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

      <ExpedientesClienteModal
        cliente={selectedCliente}
        onClose={handleCloseModal}
      />
    </div>
  );
}
