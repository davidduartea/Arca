import "server-only";

import { API_URL } from "@/lib/api-url";
import { readToken } from "@/lib/session";

/**
 * El único sitio desde el que se habla con la API.
 *
 * Corre siempre en el servidor — lo garantiza `server-only`, que rompe el build
 * si alguien lo importa desde un componente de cliente. Eso es lo que mantiene
 * el token dentro de la cookie y el origen del backend fuera del navegador.
 */

/** Lo que devuelve la API cuando algo va mal. */
export interface ApiFailure {
  error: string;
  message: string;
  issues?: { field: string; message: string }[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly failure: ApiFailure,
  ) {
    super(failure.message);
    this.name = "ApiError";
  }

  /** El nombre del error de dominio: `InsufficientFundsError`, y demás. */
  get code(): string {
    return this.failure.error;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Con sesión por defecto. Registro y acceso son los únicos sin ella. */
  anonymous?: boolean;
  /**
   * Las lecturas no se cachean.
   *
   * Un saldo cacheado es un saldo mentiroso, y aquí es el dato central. Next
   * cachearía por su cuenta si no se le dijera lo contrario.
   */
  revalidate?: number | false;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, anonymous = false, revalidate = false } = options;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  if (!anonymous) {
    const token = await readToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: revalidate === false ? "no-store" : undefined,
    next: revalidate === false ? undefined : { revalidate },
  });

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) throw new ApiError(response.status, toFailure(payload, response.status));

  return payload as T;
}

/**
 * Normaliza lo que llegue a algo con lo que se pueda escribir un mensaje.
 *
 * Si la API se cae del todo, la respuesta puede no ser ni JSON. Que eso acabe
 * en un «no se pudo conectar» y no en un `TypeError` sin contexto es la
 * diferencia entre una pantalla que explica y una que se queda en blanco.
 */
function toFailure(payload: unknown, status: number): ApiFailure {
  if (payload !== null && typeof payload === "object") {
    const raw = payload as Record<string, unknown>;

    return {
      error: typeof raw["error"] === "string" ? raw["error"] : `HTTP${status}`,
      message: typeof raw["message"] === "string" ? raw["message"] : "No se pudo completar.",
      issues: Array.isArray(raw["issues"])
        ? (raw["issues"] as { field: string; message: string }[])
        : undefined,
    };
  }

  return { error: `HTTP${status}`, message: "No se pudo conectar con el libro." };
}
