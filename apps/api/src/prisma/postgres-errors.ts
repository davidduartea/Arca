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
  const root = asRecord(error);
  if (!root) return undefined;

  const meta = asRecord(root["meta"]);
  const adapter = asRecord(meta?.["driverAdapterError"]);

  // Sin adaptador de por medio, el error ya es el de Postgres.
  const cause = asRecord(adapter?.["cause"]) ?? root;

  const code =
    sqlState(cause["originalCode"]) ?? sqlState(cause["code"]) ?? fromPrismaCode(root["code"]);

  const message =
    asText(cause["originalMessage"]) ?? asText(cause["message"]) ?? asText(root["message"]);

  if (code === undefined && message === undefined) return undefined;

  return {
    code,
    constraint: constraintName(cause) ?? prismaTargetColumns(root),
    message: message ?? "sin mensaje",
  };
}

/** ¿Es una violación de unicidad que menciona esta columna o restricción? */
export function isUniqueViolationOn(error: unknown, needle: string): boolean {
  const failure = readPostgresFailure(error);
  if (failure?.code !== PG_UNIQUE_VIOLATION) return false;

  return [failure.constraint, failure.message].some(
    (field) => field?.includes(needle) === true,
  );
}

/** Un SQLSTATE es siempre de cinco caracteres; lo demás no nos sirve. */
function sqlState(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{5}$/.test(value) ? value : undefined;
}

/**
 * Los códigos de Prisma que sabemos a qué SQLSTATE corresponden.
 *
 * Es la red de seguridad para cuando el error no trae el del adaptador: al
 * menos los dos casos que el dominio distingue siguen llegando.
 */
function fromPrismaCode(value: unknown): string | undefined {
  if (value === "P2002") return PG_UNIQUE_VIOLATION;
  if (value === "P2003") return PG_FOREIGN_KEY_VIOLATION;

  return undefined;
}

/** En unicidad llega como `{ fields: [...] }`; en `pg` a pelo, como texto. */
function constraintName(cause: Record<string, unknown>): string | undefined {
  const constraint = cause["constraint"];
  if (typeof constraint === "string") return asText(constraint);

  const fields = asRecord(constraint)?.["fields"];
  if (Array.isArray(fields)) return asText(fields.map(String).join(","));

  return undefined;
}

/** La forma vieja de Prisma, por si el adaptador no dejó nada. */
function prismaTargetColumns(root: Record<string, unknown>): string | undefined {
  const target = asRecord(root["meta"])?.["target"];
  if (typeof target === "string") return asText(target);
  if (Array.isArray(target)) return asText(target.map(String).join(","));

  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
