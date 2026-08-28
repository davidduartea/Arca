import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/session";

/**
 * Quién puede pasar, decidido antes de renderizar nada.
 *
 * El guardia del layout ya redirige a quien no tiene sesión, pero lo hace
 * después de preguntarle a la API quién es — un viaje al servidor para acabar
 * echando a alguien. Aquí se resuelve leyendo la cookie, sin salir del proceso.
 *
 * Y hace lo que el layout no puede: **distinguir «nunca entró» de «se le pasó
 * la hora»**. Para quien lleva media transferencia escrita, eso es la
 * diferencia entre una pantalla de acceso desconcertante y una que explica.
 *
 * En Next 16 esto se llama `proxy` y ya no `middleware`.
 */
export function proxy(request: NextRequest): NextResponse {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const { pathname, search } = request.nextUrl;

  if (token && !hasExpired(token)) return NextResponse.next();

  const login = new URL("/login", request.url);

  // A dónde volver. Sólo rutas de esta misma aplicación: aceptar una URL
  // completa convertiría esto en un redirector abierto, y un enlace a
  // `/login?next=https://otro-sitio` mandaría a alguien fuera desde un dominio
  // en el que confía.
  login.searchParams.set("next", `${pathname}${search}`);

  // El correo no viaja en la URL — acabaría en registros e historial. La
  // pantalla de acceso lo saca de la propia cookie caducada, que sigue ahí
  // porque un token vencido no abre nada.
  if (token) login.searchParams.set("expired", "1");

  return NextResponse.redirect(login);
}

/**
 * ¿Está vencido?
 *
 * Se lee el `exp` **sin verificar la firma**, y es correcto: aquí no hay
 * secreto con el que verificar, y quien de verdad valida es la API en cada
 * petición. Esto sólo decide si merece la pena intentarlo — un token falsificado
 * pasaría este filtro y moriría en el guardia del servidor.
 */
function hasExpired(token: string): boolean {
  const payload = token.split(".")[1];
  if (!payload) return true;

  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));

    if (typeof decoded !== "object" || decoded === null) return true;

    const exp = (decoded as { exp?: unknown }).exp;
    if (typeof exp !== "number") return true;

    return exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export const config = {
  // `/account` va suelto y sin `:path*`: es una sola pantalla y no cuelga nada
  // de ella. Escribirlo como prefijo haría que tapara también a `/accounts`, que
  // es otra cosa y ya tiene su entrada.
  matcher: ["/account", "/accounts/:path*", "/transfers/:path*", "/deposits/:path*"],
};
