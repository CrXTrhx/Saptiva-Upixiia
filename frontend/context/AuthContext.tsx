"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { LoginCredentials, User } from "@/lib/types";
import { authService } from "@/services/authService";

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (credentials: LoginCredentials) => Promise<string | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Inicia sin usuario y "loading" en true: el primer render del cliente coincide
  // con el del servidor (que no tiene localStorage). La sesion se lee tras montar,
  // en useEffect, evitando el error de hidratacion.
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(authService.getCurrentUser());
    setLoading(false);
  }, []);

  const login = useCallback(
    async (credentials: LoginCredentials): Promise<string | null> => {
      const result = await authService.login(credentials);
      if (result.success) {
        setUser(result.user);
        return null;
      }
      return result.error;
    },
    [],
  );

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
