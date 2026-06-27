"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { ContadoresEstado } from "@/components/dashboard/ContadoresEstado";
import { FiltrosBusqueda } from "@/components/dashboard/FiltrosBusqueda";
import { TablaExpedientes } from "@/components/dashboard/TablaExpedientes";
import { TablaClientes } from "@/components/dashboard/TablaClientes";
import { VistaToggle, type VistaDashboard } from "@/components/dashboard/VistaToggle";
import ClienteDetalle from "@/components/dashboard/ClienteDetalle";
import { setNuevaVentaPrefill } from "@/lib/nueva-venta-handoff";
import { expedientesService } from "@/services/expedientesService";
import type {
  ClienteResumen,
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
  const [huerfanos, setHuerfanos] = useState<number | null>(null);
  const [query, setQuery] = useState<ExpedienteQuery>({});
  const [activeView, setActiveView] = useState<VistaDashboard>("cliente");

  // Carga por pasos: la lista de clientes (compacta) y la de expedientes se piden
  // por separado y SOLO la de la vista activa. Así, al entrar, el navegador no
  // descarga todos los expedientes de golpe.
  const [clientes, setClientes] = useState<ClienteResumen[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [loadingExpedientes, setLoadingExpedientes] = useState(false);

  // Cliente seleccionado → sus expedientes se cargan al hacer clic (no antes).
  const [selectedCliente, setSelectedCliente] = useState<ClienteResumen | null>(null);
  const [clienteExpedientes, setClienteExpedientes] = useState<Expediente[]>([]);
  const [loadingClienteExpedientes, setLoadingClienteExpedientes] = useState(false);

  const [loadingConteos, setLoadingConteos] = useState(true);

  // Conteos + huérfanos pendientes en UNA sola request (antes eran 2).
  useEffect(() => {
    expedientesService.getDashboardResumen().then((r) => {
      setConteos(r.conteos);
      setHuerfanos(r.huerfanosPendientes);
      setLoadingConteos(false);
    });
  }, []);

  // Vista "Por cliente": pide la lista agregada de clientes (uno por RFC).
  useEffect(() => {
    if (activeView !== "cliente") return;
    let cancelled = false;
    setLoadingClientes(true);
    expedientesService.getClientes(query).then((data) => {
      if (cancelled) return;
      setClientes(data);
      setLoadingClientes(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeView, query]);

  // Vista "Por prioridad": pide la lista completa de expedientes (carga diferida:
  // solo cuando el usuario entra a esta vista).
  useEffect(() => {
    if (activeView !== "prioridad") return;
    let cancelled = false;
    setLoadingExpedientes(true);
    expedientesService.getExpedientes(query).then((data) => {
      if (cancelled) return;
      setExpedientes(data);
      setLoadingExpedientes(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeView, query]);

  // Al seleccionar un cliente, se cargan SOLO sus expedientes.
  useEffect(() => {
    if (!selectedCliente) return;
    let cancelled = false;
    setLoadingClienteExpedientes(true);
    setClienteExpedientes([]);
    expedientesService
      .getExpedientesDeCliente(selectedCliente.id)
      .then((data) => {
        if (cancelled) return;
        setClienteExpedientes(data);
        setLoadingClienteExpedientes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCliente]);

  const handleQueryChange = useCallback((next: ExpedienteQuery) => {
    setQuery(next);
  }, []);

  const handleViewChange = useCallback((view: VistaDashboard) => {
    setActiveView(view);
  }, []);

  const handleSelectCliente = useCallback((cliente: ClienteResumen) => {
    setSelectedCliente(cliente);
  }, []);

  const handleCloseDetalle = useCallback(() => {
    setSelectedCliente(null);
    setClienteExpedientes([]);
  }, []);

  const hasFilters = !!(
    query.search ||
    query.estado ||
    query.rangoFecha ||
    query.documentoFaltante
  );

  // Detalle de cliente a pantalla completa: muestra solo los expedientes de ESE
  // cliente (cargados al hacer clic). El botón "Nueva venta" precarga los datos del
  // cliente y los bloquea (solo se edita la venta).
  if (selectedCliente) {
    return (
      <ClienteDetalle
        cliente={selectedCliente}
        expedientes={clienteExpedientes}
        loading={loadingClienteExpedientes}
        onBack={handleCloseDetalle}
        onAbrirExpediente={(exp) => router.push(`/expedientes/${exp.id}`)}
        onNuevaVenta={(cli) => {
          setNuevaVentaPrefill({
            nombreCliente: cli.nombre ?? "",
            telefono: cli.telefono ?? "",
            correo: cli.correo ?? "",
            rfc: cli.rfc ?? "",
            tipoOperacion: "",
            montoEstimado: "",
            returnTo: "back",
            lockedFields: ["clienteNombre", "clienteRfc"],
            clienteLock: true,
          });
          router.push("/nueva-venta");
        }}
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
            loading={loadingClientes}
            hasFilters={hasFilters}
            onSelectCliente={handleSelectCliente}
          />
        ) : (
          <TablaExpedientes
            expedientes={expedientes}
            loading={loadingExpedientes}
            hasFilters={hasFilters}
          />
        )}
      </main>
    </div>
  );
}
