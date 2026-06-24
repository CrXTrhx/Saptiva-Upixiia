import type { AuthResult, LoginCredentials, User } from "@/lib/types";

const STORAGE_KEY = "centur_session";

const MOCK_USER: User = {
  id: "1",
  email: "admin@centur.com",
  nombre: "Administrador",
};
const MOCK_PASSWORD = "admin123";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Swap this implementation for real API calls — the interface stays the same.
export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResult> {
    await delay(800);

    if (
      credentials.email === MOCK_USER.email &&
      credentials.password === MOCK_PASSWORD
    ) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(MOCK_USER));
      return { success: true, user: MOCK_USER };
    }

    return { success: false, error: "Credenciales inválidas" };
  },

  async logout(): Promise<void> {
    localStorage.removeItem(STORAGE_KEY);
  },

  getCurrentUser(): User | null {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
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
