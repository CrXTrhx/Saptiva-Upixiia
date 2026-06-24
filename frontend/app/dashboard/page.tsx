"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold text-[var(--color-text)]">
        Dashboard
      </h1>
      <p className="text-sm text-[var(--color-muted)]">
        Bienvenido, {user?.nombre}
      </p>
      <Button variant="secondary" onClick={handleLogout}>
        Cerrar sesión
      </Button>
    </main>
  );
}
