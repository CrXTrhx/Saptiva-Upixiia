"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

export function DashboardHeader({
  huerfanosPendientes,
}: {
  huerfanosPendientes: number | null;
}) {
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-7xl flex items-center justify-between px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-[var(--color-text)]">
            Expedientes
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/huerfanos"
            className="relative inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            Cola de Huérfanos
            {huerfanosPendientes != null && huerfanosPendientes > 0 && (
              <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {huerfanosPendientes}
              </span>
            )}
          </Link>

          {user && (
            <div className="hidden sm:flex items-center gap-3">
              <span className="text-xs text-[var(--color-muted)]">
                {user.nombre}
              </span>
              <button
                onClick={handleLogout}
                className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
              >
                Salir
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
