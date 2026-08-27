import { describe, expect, it } from "vitest";

import { statementQuerySchema } from "./StatementQuery";

const ACCOUNT = "9f1c2b7e-4a3d-4c8e-9b21-6d5f0a7e3c14";

describe("statementQuerySchema", () => {
  it("acepta una cuenta sin cursor: es la primera pagina", () => {
    expect(statementQuerySchema.parse({ accountId: ACCOUNT }).cursor).toBeUndefined();
  });

  /**
   * El cursor es opaco: la aplicacion no lo abre ni lo construye, solo lo
   * devuelve tal cual. Por eso no se comprueba su contenido — quien decide que
   * significa es el servidor.
   */
  it("deja pasar cualquier cursor, porque no es asunto suyo", () => {
    const raro = "eyJjcmVhdGVkQXQiOiIyMDI2LTA4LTI3In0=";

    expect(statementQuerySchema.parse({ accountId: ACCOUNT, cursor: raro }).cursor).toBe(raro);
  });

  it("pero le pone un techo, para que no sea un sitio donde meter cosas", () => {
    expect(
      statementQuerySchema.safeParse({ accountId: ACCOUNT, cursor: "x".repeat(257) }).success,
    ).toBe(false);
  });

  it("rechaza una cuenta que se sale de la ruta", () => {
    expect(statementQuerySchema.safeParse({ accountId: "../auth/me" }).success).toBe(false);
  });
});
