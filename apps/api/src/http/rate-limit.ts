import type { TokenService } from "../auth/token.service";

const SCHEME = "Bearer ";

/** Un techo general para que nadie pueda martillear la API. */
export const GLOBAL_RATE_LIMIT = { name: "default", ttl: 60_000, limit: 120 };

/** Lo que sale en el 429. En castellano y sin el nombre de ninguna clase dentro. */
export const RATE_LIMIT_MESSAGE = "Demasiadas peticiones. Espera un momento y vuelve a probar";

/**
 * A quién se le cuentan las peticiones.
 *
 * Por defecto el limitador cuenta por IP, y contar por IP castiga a quien no ha
 * hecho nada: detrás de un NAT —una oficina, una universidad, un operador
 * móvil— cientos de personas comparten una dirección, así que basta con que una
 * use la aplicación a fondo para dejar fuera a las demás. Y al revés: quien
 * quiera gastar el cupo de otro sólo tiene que sentarse en la misma red.
 *
 * Así que en cuanto hay sesión se cuenta **por persona**. La IP se queda para
 * quien todavía no la tiene, que es justo donde hace falta: registro y acceso
 * son las puertas que se prueban a ciegas.
 *
 * ## Por qué se verifica la firma aquí, y no se lee el `sub` a secas
 *
 * Porque leer el identificador sin comprobar la firma haría el limitador
 * **inútil**: cualquiera escribiría un `sub` distinto en cada petición y
 * estrenaría cupo cada vez, que es peor que contar por IP. Verificado, falsear
 * la identidad exige el secreto; y un token legítimo pertenece a una cuenta que
 * alguien tuvo que crear y abrir, con sus propios límites en el camino.
 *
 * El coste es comprobar la firma dos veces por petición — aquí y en el guardia
 * de sesión —, y es un HMAC sobre unos cientos de bytes. Pasarle el resultado
 * al otro guardia ahorraría eso a cambio de atarlos: en los tests el limitador
 * se sustituye, y el de sesión dejaría de encontrar lo que espera.
 *
 * No mira si la sesión sigue abierta. Eso es una consulta a la base, y hacerla
 * antes de contar es exactamente lo que el limitador existe para evitar.
 *
 * Los prefijos separan los dos espacios: sin ellos, un identificador de usuario
 * y una dirección nunca chocarían por su forma, pero la garantía sería una
 * casualidad y no una decisión.
 */
export async function trackerFor(
  request: Record<string, unknown>,
  tokens: TokenService,
): Promise<string> {
  const token = bearerToken(request);

  if (token !== null) {
    try {
      const { sub } = await tokens.verify(token);
      if (sub) return `user:${sub}`;
    } catch {
      // Un token roto o caducado no identifica a nadie: cuenta como anónimo.
    }
  }

  return `ip:${typeof request["ip"] === "string" ? request["ip"] : "desconocida"}`;
}

function bearerToken(request: Record<string, unknown>): string | null {
  const headers = request["headers"];
  if (typeof headers !== "object" || headers === null) return null;

  const header = (headers as Record<string, unknown>)["authorization"];
  if (typeof header !== "string" || !header.startsWith(SCHEME)) return null;

  const token = header.slice(SCHEME.length).trim();

  return token.length > 0 ? token : null;
}
