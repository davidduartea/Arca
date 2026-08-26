/**
 * Traductor de errores de PostgreSQL.
 *
 * Prisma no tiene un código propio para «un trigger me dijo que no», así que
 * para saber por qué la base rechazó una escritura hay que bajar al error
 * original. Con el adaptador de driver de Prisma 7 ese error no está en la
 * cadena de `cause`: viaja dentro de `meta.driverAdapterError.cause`, y su
 * forma cambia según el tipo de violación.
 *
 * Las dos que nos importan, tal y como llegan de verdad:
 *
 * ```
 * // Violación de unicidad
 * code: "P2002"
 * meta.driverAdapterError.cause = {
 *   originalCode: "23505",
 *   originalMessage: 'duplicate key value violates unique constraint "..."',
 *   kind: "UniqueConstraintViolation",
 *   constraint: { fields: ["idempotency_key"] },
 * }
 *
 * // Violación de CHECK o de trigger
 * code: "P2010"
 * meta.driverAdapterError.cause = {
 *   originalCode: "23514",
 *   originalMessage: "La transacción ... descuadra en ... centavos",
 *   kind: "postgres",
 *   code: "23514",
 * }
 * ```
 *
 * 📖 https://www.postgresql.org/docs/17/errcodes-appendix.html
 */

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_CHECK_VIOLATION = "23514";
export const PG_FOREIGN_KEY_VIOLATION = "23503";

export interface PostgresFailure {
  /** El SQLSTATE de cinco dígitos, si se pudo averiguar. */
  code?: string;
  /** El nombre de la restricción, o las columnas, según qué dé Postgres. */
  constraint?: string;
  /** El mensaje de Postgres, que en un trigger es el que escribimos nosotros. */
  message: string;
}

/**
 * Saca de un error lo que venga de Postgres.
 *
 * Cubre las tres formas en las que puede llegar: el error de Prisma con el
 * adaptador dentro, un error de Prisma sin adaptador (sólo su código propio) y
 * un error de `pg` a pelo, que es lo que se ve al usar el driver directamente.
 */
export function readPostgresFailure(error: unknown): PostgresFailure | undefined {
  const raiz = comoObjeto(error);
  if (!raiz) return undefined;

  const meta = comoObjeto(raiz["meta"]);
  const adaptador = comoObjeto(meta?.["driverAdapterError"]);

  // Sin adaptador de por medio, el error ya es el de Postgres.
  const causa = comoObjeto(adaptador?.["cause"]) ?? raiz;

  const code =
    sqlState(causa["originalCode"]) ??
    sqlState(causa["code"]) ??
    traducirCodigoDePrisma(raiz["code"]);

  const message =
    texto(causa["originalMessage"]) ?? texto(causa["message"]) ?? texto(raiz["message"]);

  if (code === undefined && message === undefined) return undefined;

  return {
    code,
    constraint: nombreDeRestriccion(causa) ?? columnasDePrisma(raiz),
    message: message ?? "sin mensaje",
  };
}

/** ¿Es una violación de unicidad que menciona esta columna o restricción? */
export function isUniqueViolationOn(error: unknown, aguja: string): boolean {
  const fallo = readPostgresFailure(error);
  if (fallo?.code !== PG_UNIQUE_VIOLATION) return false;

  return [fallo.constraint, fallo.message].some((campo) => campo?.includes(aguja) === true);
}

/** Un SQLSTATE es siempre de cinco caracteres; lo demás no nos sirve. */
function sqlState(valor: unknown): string | undefined {
  return typeof valor === "string" && /^\d{5}$/.test(valor) ? valor : undefined;
}

/**
 * Los códigos de Prisma que sabemos a qué SQLSTATE corresponden.
 *
 * Es la red de seguridad para cuando el error no trae el del adaptador: al
 * menos los dos casos que el dominio distingue siguen llegando.
 */
function traducirCodigoDePrisma(valor: unknown): string | undefined {
  if (valor === "P2002") return PG_UNIQUE_VIOLATION;
  if (valor === "P2003") return PG_FOREIGN_KEY_VIOLATION;

  return undefined;
}

/** En unicidad llega como `{ fields: [...] }`; en `pg` a pelo, como texto. */
function nombreDeRestriccion(causa: Record<string, unknown>): string | undefined {
  const constraint = causa["constraint"];
  if (typeof constraint === "string") return texto(constraint);

  const fields = comoObjeto(constraint)?.["fields"];
  if (Array.isArray(fields)) return texto(fields.map(String).join(","));

  return undefined;
}

/** La forma vieja de Prisma, por si el adaptador no dejó nada. */
function columnasDePrisma(raiz: Record<string, unknown>): string | undefined {
  const target = comoObjeto(raiz["meta"])?.["target"];
  if (typeof target === "string") return texto(target);
  if (Array.isArray(target)) return texto(target.map(String).join(","));

  return undefined;
}

function comoObjeto(valor: unknown): Record<string, unknown> | undefined {
  return typeof valor === "object" && valor !== null
    ? (valor as Record<string, unknown>)
    : undefined;
}

function texto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.length > 0 ? valor : undefined;
}
