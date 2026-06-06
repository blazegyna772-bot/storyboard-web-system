export const backendApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";

export async function backendRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body != null;
  const response = await fetch(`${backendApiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload.detail === "string" ? payload.detail : payload.error;
    throw new Error(detail || `Request failed: ${response.status}`);
  }
  return payload as T;
}
