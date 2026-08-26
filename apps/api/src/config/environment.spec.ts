import { describe, expect, it } from "vitest";

import { loadEnvironment } from "./environment";

const MINIMUM = {
  DATABASE_URL: "postgresql://arca:arca@localhost:5433/arca",
  JWT_SECRET: "un-secreto-suficientemente-largo-para-firmar",
};

describe("loadEnvironment", () => {
  it("rellena lo que no es obligatorio", () => {
    const env = loadEnvironment({ ...MINIMUM });

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);

    // Cero es lo seguro: sin proxy delante, la IP que ve Express es la de
    // verdad. Confiar en proxies que no existen deja falsificarla.
    expect(env.TRUST_PROXY_HOPS).toBe(0);
  });

  it("no acepta un secreto de firma corto", () => {
    // Un secreto corto se rompe a fuerza bruta sin tocar el servidor: el
    // atacante ya tiene un token firmado con el que comparar.
    expect(() => loadEnvironment({ ...MINIMUM, JWT_SECRET: "corto" })).toThrow(/JWT_SECRET/);
    expect(() => loadEnvironment({ DATABASE_URL: MINIMUM.DATABASE_URL })).toThrow(/JWT_SECRET/);
  });

  it("convierte el puerto, que llega como texto", () => {
    expect(loadEnvironment({ ...MINIMUM, PORT: "8080" }).PORT).toBe(8080);
  });

  it("no arranca sin cadena de conexión", () => {
    expect(() => loadEnvironment({})).toThrow(/DATABASE_URL/);
  });

  it("no acepta una cadena que no sea de Postgres", () => {
    expect(() => loadEnvironment({ DATABASE_URL: "mysql://arca@localhost/arca" })).toThrow(
      /PostgreSQL/,
    );
  });

  it("no acepta un puerto imposible", () => {
    expect(() => loadEnvironment({ ...MINIMUM, PORT: "0" })).toThrow(/PORT/);
    expect(() => loadEnvironment({ ...MINIMUM, PORT: "99999" })).toThrow(/PORT/);
  });

  it("no acepta un entorno que no conoce", () => {
    expect(() => loadEnvironment({ ...MINIMUM, NODE_ENV: "produccion" })).toThrow(/NODE_ENV/);
  });

  it("dice todo lo que falta de una vez, no lo primero que encuentra", () => {
    // Arreglar la configuración a ciegas, error a error, es innecesariamente
    // lento cuando el validador ya los ha visto todos.
    const failure = captureMessage(() => loadEnvironment({ PORT: "0", NODE_ENV: "otro" }));

    expect(failure).toContain("DATABASE_URL");
    expect(failure).toContain("PORT");
    expect(failure).toContain("NODE_ENV");
  });
});

function captureMessage(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error("Se esperaba que fallara y no falló");
}
