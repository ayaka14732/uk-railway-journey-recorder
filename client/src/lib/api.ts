const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function apiUrl(path: string): string {
  if (!apiBaseUrl) return path;
  return `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function apiJson<T>(path: string, options?: RequestInit): Promise<T> {
  const { headers: extra, ...rest } = options ?? {};
  const response = await fetch(apiUrl(path), {
    headers: { "Content-Type": "application/json", ...(extra as Record<string, string> | undefined) },
    ...rest,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body.detail === "string" ? body.detail : body.detail?.message || response.statusText;
    throw new ApiError(response.status, detail);
  }
  return body as T;
}
