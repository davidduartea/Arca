import { describe, expect, it } from "vitest";

import { loadEnvironment } from "./environment";

const MINIMO = { DATABASE_URL: "postgresql://arca:arca@localhost:5433/arca" };

describe("loadEnvironment", () => {
  it("rellena lo que no es obligatorio", () => {
    const env = loadEnvironment({ ...MINIMO });

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
  });

  it("convierte el puerto, que llega como texto", () => {
    expect(loadEnvironment({ ...MINIMO, PORT: "8080" }).PORT).toBe(8080);
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
    expect(() => loadEnvironment({ ...MINIMO, PORT: "0" })).toThrow(/PORT/);
    expect(() => loadEnvironment({ ...MINIMO, PORT: "99999" })).toThrow(/PORT/);
  });

  it("no acepta un entorno que no conoce", () => {
    expect(() => loadEnvironment({ ...MINIMO, NODE_ENV: "produccion" })).toThrow(/NODE_ENV/);
  });

  it("dice todo lo que falta de una vez, no lo primero que encuentra", () => {
    // Arreglar la configuración a ciegas, error a error, es innecesariamente
    // lento cuando el validador ya los ha visto todos.
    const fallo = capturarMensaje(() => loadEnvironment({ PORT: "0", NODE_ENV: "otro" }));

    expect(fallo).toContain("DATABASE_URL");
    expect(fallo).toContain("PORT");
    expect(fallo).toContain("NODE_ENV");
  });
});

function capturarMensaje(accion: () => unknown): string {
  try {
    accion();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error("Se esperaba que fallara y no falló");
}
