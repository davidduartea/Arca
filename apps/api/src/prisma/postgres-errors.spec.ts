import { describe, expect, it } from "vitest";

import {
  PG_CHECK_VIOLATION,
  PG_UNIQUE_VIOLATION,
  isUniqueViolationOn,
  readPostgresFailure,
} from "./postgres-errors";

/**
 * Los errores de este archivo no están inventados.
 *
 * Son la forma exacta con la que Prisma 7 entrega cada caso, copiada de una
 * ejecución real contra Postgres. Inventar la forma sería inútil: el valor de
 * este lector está justamente en acertar dónde esconde el adaptador de driver
 * el error de verdad, y un fixture imaginado probaría la suposición, no el
 * hecho.
 */
describe("readPostgresFailure", () => {
  it("saca el SQLSTATE y el mensaje que escribe el trigger", () => {
    const fallo = readPostgresFailure(errorDeTrigger());

    expect(fallo?.code).toBe(PG_CHECK_VIOLATION);
    expect(fallo?.message).toContain("descuadra en -2000 centavos");
  });

  it("saca la unicidad y la columna que la provocó", () => {
    const fallo = readPostgresFailure(errorDeUnicidad());

    expect(fallo?.code).toBe(PG_UNIQUE_VIOLATION);
    expect(fallo?.constraint).toBe("idempotency_key");
  });

  it("entiende un error de `pg` a pelo, sin Prisma de por medio", () => {
    // Es lo que se ve al usar el driver directamente, como en el arranque de
    // los tests: ahí el código y la restricción están en la raíz.
    const fallo = readPostgresFailure(
      Object.assign(
        new Error('duplicate key value violates unique constraint "accounts_pkey"'),
        {
          code: "23505",
          constraint: "accounts_pkey",
        },
      ),
    );

    expect(fallo?.code).toBe(PG_UNIQUE_VIOLATION);
    expect(fallo?.constraint).toBe("accounts_pkey");
  });

  it("cae en el código propio de Prisma cuando el adaptador no dejó nada", () => {
    const fallo = readPostgresFailure(
      Object.assign(new Error("Unique constraint failed"), {
        code: "P2002",
        meta: { target: ["idempotency_key"] },
      }),
    );

    expect(fallo?.code).toBe(PG_UNIQUE_VIOLATION);
    expect(fallo?.constraint).toBe("idempotency_key");
  });

  it("deja el motivo sin código cuando Prisma lo enmascara", () => {
    // El caso que obliga al servicio a adelantar las comprobaciones: si la
    // restricción diferida salta en el COMMIT, esto es todo lo que llega.
    const fallo = readPostgresFailure(
      Object.assign(
        new Error(
          "Transaction API error: Transaction already closed: A rollback cannot be executed",
        ),
        { code: "P2028", meta: { modelName: "Transaction" } },
      ),
    );

    expect(fallo?.code).toBeUndefined();
    expect(fallo?.message).toContain("already closed");
  });

  it("devuelve undefined para lo que ni siquiera es un error", () => {
    expect(readPostgresFailure(null)).toBeUndefined();
    expect(readPostgresFailure(undefined)).toBeUndefined();
    expect(readPostgresFailure("un texto suelto")).toBeUndefined();
    expect(readPostgresFailure(42)).toBeUndefined();
  });
});

describe("isUniqueViolationOn", () => {
  it("reconoce la columna que chocó", () => {
    expect(isUniqueViolationOn(errorDeUnicidad(), "idempotency_key")).toBe(true);
  });

  it("no confunde una columna con otra", () => {
    expect(isUniqueViolationOn(errorDeUnicidad(), "reverses_id")).toBe(false);
  });

  it("no toma por unicidad lo que es un trigger", () => {
    expect(isUniqueViolationOn(errorDeTrigger(), "idempotency_key")).toBe(false);
  });

  it("aguanta que le pasen cualquier cosa", () => {
    expect(isUniqueViolationOn(null, "idempotency_key")).toBe(false);
    expect(isUniqueViolationOn(new Error("algo se rompió"), "idempotency_key")).toBe(false);
  });
});

/** Capturado de un `INSERT` que violó el trigger `entries_must_balance`. */
function errorDeTrigger(): unknown {
  return Object.assign(new Error("Raw query failed. Code: `23514`."), {
    code: "P2010",
    meta: {
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: {
          originalCode: "23514",
          originalMessage:
            "La transacción 35121021-dcb3-4a44-8b33-6b79cd653bba descuadra en -2000 centavos: los asientos deben sumar cero",
          kind: "postgres",
          code: "23514",
          severity: "ERROR",
        },
      },
    },
  });
}

/** Capturado de un `INSERT` que repitió la clave de idempotencia. */
function errorDeUnicidad(): unknown {
  return Object.assign(
    new Error("Unique constraint failed on the fields: (`idempotency_key`)"),
    {
      code: "P2002",
      meta: {
        modelName: "Transaction",
        driverAdapterError: {
          name: "DriverAdapterError",
          cause: {
            originalCode: "23505",
            originalMessage:
              'duplicate key value violates unique constraint "transactions_idempotency_key_key"',
            kind: "UniqueConstraintViolation",
            constraint: { fields: ["idempotency_key"] },
          },
        },
      },
    },
  );
}
