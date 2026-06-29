"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const next: typeof errors = {};
    if (!email.trim()) next.email = "El correo es requerido";
    else if (!EMAIL_RE.test(email)) next.email = "Formato de correo inválido";
    if (!password) next.password = "La contraseña es requerida";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;

    setSubmitting(true);
    const error = await login({ email: email.trim(), password });
    setSubmitting(false);

    if (error) {
      setServerError(error);
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !submitting) {
          e.preventDefault();
          handleSubmit(e as unknown as FormEvent);
        }
      }}
      noValidate
      className="flex flex-col gap-5"
    >
  
      <Input
        label="Correo electrónico"
        type="email"
        placeholder="admin@centur.com"
        autoComplete="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
        }}
        error={errors.email}
        className="bg-white/90 border-[rgba(241,155,66,0.18)] shadow-[0_10px_30px_rgba(241,155,66,0.08)]"
      />

      <Input
        label="Contraseña"
        type="password"
        placeholder="••••••••"
        autoComplete="current-password"
        togglePassword
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
        }}
        error={errors.password}
        className="bg-white/90 border-[rgba(241,155,66,0.18)] shadow-[0_10px_30px_rgba(241,155,66,0.08)]"
      />

      {serverError && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600" role="alert">
          {serverError}
        </p>
      )}

      <Button
        type="submit"
        loading={submitting}
        className="mt-1 w-full rounded-[18px] py-3 text-sm tracking-wide shadow-[0_14px_48px_rgba(241,155,66,0.2)]"
      >
        Iniciar sesión
      </Button>
    </form>
  );
}
