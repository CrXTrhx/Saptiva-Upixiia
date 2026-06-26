const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

const TOKEN_KEY = "auth_token";

function authHeader(): Record<string, string> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...authHeader(),
    ...options.headers,
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Subida de archivos (multipart/form-data). No fija Content-Type para que el
// navegador agregue el boundary correcto. Reutiliza el token de auth.
export async function apiUpload<T>(
  endpoint: string,
  formData: FormData,
  method: "POST" | "PATCH" = "POST",
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    method,
    headers: { ...authHeader() },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
