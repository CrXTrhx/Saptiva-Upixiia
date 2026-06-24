"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/Card";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  if (loading || user) return null;

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{
        background: "radial-gradient(circle at top left, rgba(241,155,66,0.18), transparent 18%), radial-gradient(circle at bottom right, rgba(241,155,66,0.08), transparent 20%), linear-gradient(180deg, #fff9f2 0%, #f7f0e7 100%)",
      }}
    >
      <div className="w-full max-w-md">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-[var(--color-accent)] shadow-[0_0_30px_rgba(241,155,66,0.22)]" />
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[var(--color-accent)] mb-4">
            Centur
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--color-text)]">
            Bienvenido de vuelta
          </h1>
         
        </div>

        <Card className="rounded-[32px] border border-white/30 bg-white/95 shadow-[0_40px_90px_rgba(31,31,31,0.08)] backdrop-blur-xl">
          <div className="px-1 py-2 mb-8 rounded-full bg-[rgba(241,155,66,0.05)] text-center text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-accent)]">
            Inicio de sesión
          </div>
          <LoginForm />
        </Card>
      </div>
    </main>
  );
}
