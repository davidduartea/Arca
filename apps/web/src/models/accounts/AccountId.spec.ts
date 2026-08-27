import { describe, expect, it } from "vitest";

import { accountIdSchema } from "./AccountId";

const REAL = "9f1c2b7e-4a3d-4c8e-9b21-6d5f0a7e3c14";

describe("accountIdSchema", () => {
  it("acepta un uuid", () => {
    expect(accountIdSchema.safeParse(REAL).success).toBe(true);
  });

  /**
   * Éste es el motivo por el que el esquema existe.
   *
   * El identificador se mete dentro de la ruta que se le pide a la API. Sin
   * comprobarlo, cada uno de estos valores convierte `/accounts/<id>/statement`
   * en una dirección distinta, pedida con la sesión de quien esté mirando.
   */
  it.each([
    ["sube un nivel", "../auth/me"],
    ["sube dos", "../../auth/me"],
    ["mete una consulta", "x?foo=bar"],
    ["mete una barra", "abc/def"],
    ["mete una barra codificada", "abc%2Fdef"],
    ["mete un fragmento", "abc#frag"],
    ["viene vacío", ""],
    ["es un uuid con basura detrás", `${REAL}/../../auth/me`],
  ])("rechaza un identificador que %s", (_caso, value) => {
    expect(accountIdSchema.safeParse(value).success).toBe(false);
  });
});
