export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export const TOKEN_KEY = "auth_token";

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const isForm =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  // Para multipart (FormData) NO se fija Content-Type: el navegador agrega el
  // boundary correcto. Para el resto, JSON.
  const headers: Record<string, string> = {
    ...(isForm ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string> | undefined),
  };

  const token =
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    // Sesion invalida/expirada: limpiar y mandar a login (recupera de sesiones viejas).
    if (res.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem("centur_session");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }

  // 204 No Content o cuerpo vacio
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
