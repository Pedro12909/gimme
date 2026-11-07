import { getConfig } from "@/config";

export class ApiError extends Error {
  readonly status: number;
  // A machine-readable reason some errors carry, e.g. "LAST_LIST"
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getConfig().apiUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      body.error ?? response.statusText,
      typeof body.code === "string" ? body.code : undefined,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
