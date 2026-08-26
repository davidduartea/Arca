import { afterEach, describe, expect, it } from "vitest";

import { loadDotEnvFile } from "./dotenv";

const SENTINEL = "DATABASE_URL";

describe("loadDotEnvFile", () => {
  const original = process.env[SENTINEL];

  afterEach(() => {
    if (original === undefined) delete process.env[SENTINEL];
    else process.env[SENTINEL] = original;
  });

  it("no pisa lo que ya viene del entorno", () => {
    // La propiedad que importa: un `.env` olvidado en un servidor no puede
    // ganarle a las variables reales. Si las pisara, un archivo de desarrollo
    // apuntaría producción a otra base sin que nadie se enterase.
    process.env[SENTINEL] = "postgresql://centinela@localhost/centinela";

    loadDotEnvFile();

    expect(process.env[SENTINEL]).toBe("postgresql://centinela@localhost/centinela");
  });

  it("no se queja si no hay archivo", () => {
    // En producción no lo hay: la configuración viene del entorno.
    expect(() => {
      loadDotEnvFile();
    }).not.toThrow();
  });
});
