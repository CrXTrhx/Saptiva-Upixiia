"use client";

import { useCallback, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { ContadoresEstado } from "@/components/dashboard/ContadoresEstado";
import { FiltrosBusqueda } from "@/components/dashboard/FiltrosBusqueda";
import { TablaExpedientes } from "@/components/dashboard/TablaExpedientes";
import { expedientesService } from "@/services/expedientesService";
import type { ConteoEstados, Expediente, ExpedienteQuery } from "@/lib/types";

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
  const [huerfanos, setHuerfanos] = useState<number | null>(null);
  const [query, setQuery] = useState<ExpedienteQuery>({});
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
    setLoadingTable(true);
    expedientesService.getExpedientes(query).then((data) => {
      setExpedientes(data);
      setLoadingTable(false);
    });
  }, [query]);

  const handleQueryChange = useCallback((next: ExpedienteQuery) => {
    setQuery(next);
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
        <TablaExpedientes
          expedientes={expedientes}
          loading={loadingTable}
          hasFilters={hasFilters}
        />
      </main>
    </div>
  );
}
