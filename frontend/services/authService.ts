import type { AuthResult, LoginCredentials, User } from "@/lib/types";
import { apiClient, TOKEN_KEY } from "@/lib/apiClient";

const USER_KEY = "centur_session";

type LoginResponse = { success: boolean; user: User; token: string };

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResult> {
    try {
      const data = await apiClient<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      return { success: true, user: data.user };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Error de autenticación",
      };
    }
  },

  async logout(): Promise<void> {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  getCurrentUser(): User | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(USER_KEY);
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
