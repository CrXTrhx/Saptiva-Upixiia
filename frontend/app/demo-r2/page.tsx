"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

// Página de demo AUTÓNOMA: solo demuestra la subida de archivos al backend y su
// almacenamiento en Cloudflare R2. No usa el AuthContext ni los servicios mock;
// hace sus propias llamadas reales a la API. Pensada para enseñar el flujo de R2.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

const TIPOS = [
  { code: "OFFICIAL_ID", label: "INE / Identificación oficial" },
  { code: "CURP", label: "CURP" },
  { code: "TAX_STATUS_CERT", label: "Constancia de Situación Fiscal" },
  { code: "PROOF_OF_ADDRESS", label: "Comprobante de domicilio" },
];

type Expediente = { id: string; codigo: string; estado: string; clienteNombre: string };

type DocResp = {
  id: string;
  tipo: string;
  estado: string;
  filename: string;
  archivoUrl: string;
  mimeType: string;
  datosExtraidos?: Record<string, string> | null;
  motivoRechazo?: { categoria: string; texto: string } | null;
};

export default function DemoR2Page() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("admin@centur.com");
  const [password, setPassword] = useState("admin123");
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [expedienteId, setExpedienteId] = useState("");
  const [tipo, setTipo] = useState(TIPOS[0].code);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<DocResp | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function login() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? "Error de login");
      setToken(body.token);
      // Cargar expedientes para elegir uno
      const exRes = await fetch(`${API_BASE}/expedientes`, {
        headers: { Authorization: `Bearer ${body.token}` },
      });
      const list: Expediente[] = await exRes.json();
      setExpedientes(list);
      if (list.length) setExpedienteId(list[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function subir() {
    if (!token || !expedienteId || !file) return;
    setError("");
    setResult(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("tipo", tipo);
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/expedientes/${expedienteId}/documentos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message ?? "Error al subir");
      setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  const esImagen = result?.mimeType?.startsWith("image/");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
          Demo · Subida de documentos a Cloudflare R2
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Sube un archivo, el backend lo guarda en R2 y devuelve una URL firmada
          temporal. Abajo se muestra el archivo cargado directamente desde R2.
        </p>
      </div>

      {!token ? (
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-medium text-[var(--color-text)]">1 · Inicia sesión</h2>
          <Input label="Correo" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input
            label="Contraseña"
            type="password"
            togglePassword
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button onClick={login} loading={busy}>
            Entrar
          </Button>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-medium text-[var(--color-text)]">2 · Sube un documento</h2>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--color-text)]">Expediente</label>
            <select
              value={expedienteId}
              onChange={(e) => setExpedienteId(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-text)]"
            >
              {expedientes.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.codigo} · {ex.clienteNombre} ({ex.estado})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--color-text)]">Tipo de documento</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-text)]"
            >
              {TIPOS.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--color-text)]">Archivo</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-[var(--color-text-secondary)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--color-accent)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[var(--color-accent-hover)]"
            />
          </div>

          <div className="flex gap-3">
            <Button onClick={subir} loading={busy} disabled={!file}>
              Subir a R2
            </Button>
            <Button variant="ghost" onClick={() => setToken(null)}>
              Cerrar sesión
            </Button>
          </div>
        </Card>
      )}

      {error && (
        <div className="rounded-lg border border-[var(--color-error)] bg-[var(--color-error-bg)] px-4 py-3 text-sm text-[var(--color-error-text)]">
          {error}
        </div>
      )}

      {result && (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-[var(--color-text)]">3 · Resultado</h2>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                result.estado === "REJECTED"
                  ? "bg-[var(--color-error-bg)] text-[var(--color-error-text)]"
                  : "bg-[var(--color-success-bg)] text-[var(--color-success)]"
              }`}
            >
              {result.estado}
            </span>
          </div>

          <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-[var(--color-muted)]">Archivo</dt>
            <dd className="text-[var(--color-text)]">{result.filename}</dd>
            <dt className="text-[var(--color-muted)]">Tipo</dt>
            <dd className="text-[var(--color-text)]">{result.tipo}</dd>
            {result.motivoRechazo && (
              <>
                <dt className="text-[var(--color-muted)]">Rechazo</dt>
                <dd className="text-[var(--color-error-text)]">
                  {result.motivoRechazo.categoria} — {result.motivoRechazo.texto}
                </dd>
              </>
            )}
          </dl>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">
              URL firmada de R2 (válida 1 hora)
            </span>
            <a
              href={result.archivoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all rounded-lg bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-accent-text-dark)] underline"
            >
              {result.archivoUrl}
            </a>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--color-text)]">
              Vista previa (cargada desde R2)
            </span>
            {esImagen ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.archivoUrl}
                alt={result.filename}
                className="max-h-80 w-auto rounded-lg border border-[var(--color-border)]"
              />
            ) : (
              <a
                href={result.archivoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg)]"
              >
                Abrir documento ({result.mimeType})
              </a>
            )}
          </div>
        </Card>
      )}
    </main>
  );
}
