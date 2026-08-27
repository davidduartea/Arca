import "server-only";
import { cookies } from "next/headers";

/**
 * La sesión vive en una cookie que el JavaScript no puede leer.
 *
 * `httpOnly` es lo que la protege: aunque alguien logre inyectar un script en
 * la página, no puede leer el token ni mandárselo a nadie. Guardarlo en
 * `localStorage` sería justo lo contrario — ahí cualquier script lo ve.
 *
 * `sameSite: lax` evita que la cookie viaje en peticiones que otro sitio
 * origine, que es la mitad del trabajo contra CSRF. La otra mitad la pone Next,
 * que compara `Origin` con `Host` en cada server action.
 */
const COOKIE = "arca_session";

const BASE = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

export async function writeSession(token: string, maxAgeSeconds: number): Promise<void> {
  const jar = await cookies();

  jar.set(COOKIE, token, { ...BASE, maxAge: maxAgeSeconds });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();

  jar.set(COOKIE, "", { ...BASE, maxAge: 0 });
}

export async function readToken(): Promise<string | undefined> {
  const jar = await cookies();

  return jar.get(COOKIE)?.value;
}

export const SESSION_COOKIE = COOKIE;
