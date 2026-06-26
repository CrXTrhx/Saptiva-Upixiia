import type { AuthResult, LoginCredentials, User } from "@/lib/types";
import { apiClient } from "@/lib/apiClient";

const SESSION_KEY = "centur_session";
const TOKEN_KEY = "auth_token";

type LoginResponse = {
  success: boolean;
  user: User;
  token: string;
};

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResult> {
    try {
      const data = await apiClient<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
      return { success: true, user: data.user };
    } catch (err) {
      return {
        success: false,
        error:
          err instanceof Error ? err.message : "Credenciales inválidas",
      };
    }
  },

  async logout(): Promise<void> {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY);
  },

  getCurrentUser(): User | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  },

  isAuthenticated(): boolean {
    return this.getCurrentUser() !== null;
  },
};
