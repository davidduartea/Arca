import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/session";

/**
 * Lo que corre antes de renderizar nada, y hace dos cosas.
 *
 * **Pone la política de contenido**, con su nonce, que es lo que obliga a que
 * esto se ejecute en todas las rutas y no sólo en las privadas.
 *
 * **Decide quién puede pasar.** El guardia del layout ya redirige a quien no
 * tiene sesión, pero lo hace después de preguntarle a la API quién es — un
 * viaje al servidor para acabar echando a alguien. Aquí se resuelve leyendo la
 * cookie, sin salir del proceso. Y hace lo que el layout no puede: **distinguir
 * «nunca entró» de «se le pasó la hora»**. Para quien lleva media transferencia
 * escrita, eso es la diferencia entre una pantalla de acceso desconcertante y
 * una que explica.
 *
 * En Next 16 esto se llama `proxy` y ya no `middleware`.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce);

  // Las cabeceras de **petición** son las que lee Next al renderizar: de ahí
  // saca el nonce para ponérselo a sus propios scripts. Sin esto, la política
  // bloquearía el arranque de la aplicación en su propia página.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", policy);

  const response = redirectToLogin(request) ?? NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", policy);

  return response;
}

/**
 * La política.
 *
 * `script-src` es la que importa y es la estricta: sólo se ejecuta lo que
 * lleve el nonce de esta petición, que se sortea de nuevo cada vez. Con
 * `strict-dynamic`, lo que cargue un script ya autorizado hereda el permiso,
 * que es como Next carga sus paquetes.
 *
 * `style-src` lleva `'unsafe-inline'` y **no** lleva nonce, a propósito: en
 * cuanto hay un nonce el navegador ignora `'unsafe-inline'`, y entonces se
 * caerían los atributos `style` — el de la barra que mide la contraseña, sin ir
 * más lejos. Hay una directiva para eso, `style-src-attr`, pero no la
 * implementan todos los navegadores y donde no está se cae a `style-src`. Lo
 * que se pierde es poco: inyectar estilos no ejecuta código, y lo que de verdad
 * hay que impedir es que se ejecute algo que no hemos escrito.
 *
 * `connect-src 'self'` es la otra mitad de la protección: aunque alguien
 * lograra ejecutar algo, no tendría a dónde mandárselo.
 *
 * En desarrollo hace falta `'unsafe-eval'`: React usa `eval` para reconstruir
 * las trazas del servidor en el navegador. En producción no.
 */
function contentSecurityPolicy(nonce: string): string {
  const development = process.env.NODE_ENV === "development";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * Las rutas que exigen sesión.
 *
 * `/account` va suelto y sin barra: es una sola pantalla y no cuelga nada de
 * ella. Escrito como prefijo taparía también a `/accounts`, que es otra cosa.
 */
const GUARDED = ["/accounts", "/transfers", "/deposits"];

function isGuarded(pathname: string): boolean {
  if (pathname === "/account") return true;

  return GUARDED.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

function redirectToLogin(request: NextRequest): NextResponse | null {
  const { pathname, search } = request.nextUrl;
  if (!isGuarded(pathname)) return null;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && !hasExpired(token)) return null;

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
  /*
    Todo menos lo que sirve el propio Next y los archivos estáticos.

    Antes sólo cubría las rutas privadas, porque lo único que hacía era el
    guardia. Ahora también pone la política de contenido, y una política que
    sólo cubriera media aplicación dejaría la portada, el acceso y el registro
    —las tres páginas por las que se entra— sin ella.
  */
  matcher: ["/((?!_next/static|_next/image|art/|favicon.ico).*)"],
};
