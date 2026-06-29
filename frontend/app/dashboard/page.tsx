"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

const PAGE_SIZE = 20;

function queryKey(query: ExpedienteQuery): string {
  return JSON.stringify(query);
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
  const [totalExpedientes, setTotalExpedientes] = useState(0);
  const [loadingMas, setLoadingMas] = useState(false);

  // Cliente seleccionado → sus expedientes se cargan al hacer clic (no antes).
  const [selectedCliente, setSelectedCliente] = useState<ClienteResumen | null>(null);
  const [clienteExpedientes, setClienteExpedientes] = useState<Expediente[]>([]);
  const [loadingClienteExpedientes, setLoadingClienteExpedientes] = useState(false);

  const [loadingConteos, setLoadingConteos] = useState(true);

  // Caché independiente por vista y filtros. La identidad de cliente sigue siendo el
  // RFC que entrega /clientes; aquí solo evitamos solicitudes repetidas al alternar.
  const clientesCache = useRef<Map<string, ClienteResumen[]>>(new Map());
  const expedientesCache = useRef<
    Map<string, { items: Expediente[]; total: number }>
  >(new Map());
  const currentQueryKey = queryKey(query);
  const currentQueryKeyRef = useRef(currentQueryKey);
  useEffect(() => {
    currentQueryKeyRef.current = currentQueryKey;
  }, [currentQueryKey]);

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
    const key = queryKey(query);
    const cached = clientesCache.current.get(key);
    if (cached) {
      setClientes(cached);
      setLoadingClientes(false);
      return;
    }

    let cancelled = false;
    setLoadingClientes(true);
    expedientesService.getClientes(query).then((data) => {
      if (cancelled) return;
      clientesCache.current.set(key, data);
      setClientes(data);
      setLoadingClientes(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeView, query]);

  // Vista "Por prioridad": pide únicamente la primera página. Las siguientes se
  // agregan con "Ver más", sin descargar todos los expedientes de golpe.
  useEffect(() => {
    if (activeView !== "prioridad") return;
    const key = queryKey(query);
    const cached = expedientesCache.current.get(key);
    if (cached) {
      setExpedientes(cached.items);
      setTotalExpedientes(cached.total);
      setLoadingExpedientes(false);
      return;
    }

    let cancelled = false;
    setLoadingExpedientes(true);
    expedientesService
      .getExpedientesPagina(query, PAGE_SIZE, 0)
      .then(({ items, total }) => {
        if (cancelled) return;
        expedientesCache.current.set(key, { items, total });
        setExpedientes(items);
        setTotalExpedientes(total);
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
    clientesCache.current.clear();
    expedientesCache.current.clear();
    setLoadingMas(false);
    setQuery(next);
  }, []);

  const handleViewChange = useCallback((view: VistaDashboard) => {
    setActiveView(view);
  }, []);

  const handleSelectCliente = useCallback((cliente: ClienteResumen) => {
    setLoadingClienteExpedientes(true);
    setClienteExpedientes([]);
    setSelectedCliente(cliente);
  }, []);

  const handleVerMas = useCallback(() => {
    if (loadingMas || expedientes.length >= totalExpedientes) return;

    const requestedQuery = query;
    const requestedKey = queryKey(requestedQuery);
    const offset = expedientes.length;
    setLoadingMas(true);

    expedientesService
      .getExpedientesPagina(requestedQuery, PAGE_SIZE, offset)
      .then(({ items, total }) => {
        if (currentQueryKeyRef.current !== requestedKey) return;
        setExpedientes((previous) => {
          const known = new Set(previous.map((item) => item.id));
          const merged = [
            ...previous,
            ...items.filter((item) => !known.has(item.id)),
          ];
          expedientesCache.current.set(requestedKey, {
            items: merged,
            total,
          });
          return merged;
        });
        setTotalExpedientes(total);
      })
      .finally(() => {
        if (currentQueryKeyRef.current === requestedKey) {
          setLoadingMas(false);
        }
      });
  }, [expedientes.length, loadingMas, query, totalExpedientes]);

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
            total={totalExpedientes}
            loading={loadingExpedientes}
            loadingMas={loadingMas}
            hasFilters={hasFilters}
            pageSize={PAGE_SIZE}
            onVerMas={handleVerMas}
          />
        )}
      </main>
    </div>
  );
}
