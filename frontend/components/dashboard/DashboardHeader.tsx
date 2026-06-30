"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";

export function DashboardHeader({
  huerfanosPendientes,
}: {
  huerfanosPendientes: number | null;
}) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-7xl flex items-center justify-between px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-[var(--color-text)]">
            Expedientes
          </h1>
        </div>

        {/* Tablet/desktop: todo visible en la barra */}
        <div className="hidden items-center gap-4 sm:flex">
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
            <div className="flex items-center gap-3">
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

        {/* Teléfono: menú colapsable con los mismos accesos */}
        <div className="relative sm:hidden" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Abrir menú"
            className="relative grid h-11 w-11 place-items-center rounded-lg text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            <MoreVertical size={20} />
            {huerfanosPendientes != null && huerfanosPendientes > 0 && (
              <span className="absolute top-1 right-1 flex h-2.5 w-2.5 rounded-full bg-red-500" />
            )}
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg"
            >
              <Link
                href="/huerfanos"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-between gap-2 px-4 py-3 text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)]"
              >
                Cola de Huérfanos
                {huerfanosPendientes != null && huerfanosPendientes > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {huerfanosPendientes}
                  </span>
                )}
              </Link>
              {user && (
                <>
                  <div className="px-4 py-2 text-xs text-[var(--color-muted)] border-t border-[var(--color-border-inner)] mt-1">
                    {user.nombre}
                  </div>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      handleLogout();
                    }}
                    className="block w-full px-4 py-3 text-left text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] cursor-pointer"
                  >
                    Salir
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
