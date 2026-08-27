import { describe, expect, it } from "vitest";

import { depositSchema } from "./DepositInput";

const VALID = {
  idempotencyKey: "9f1c2b7e-4a3d-4c8e-9b21-6d5f0a7e3c14",
  toAccountId: "1b7d3e90-55c1-4a2f-8e6d-0c9a4f2b1d38",
  amount: "3000",
  description: "Nomina de agosto",
};

describe("depositSchema", () => {
  it("acepta un ingreso con todo en su sitio", () => {
    expect(depositSchema.safeParse(VALID).success).toBe(true);
  });

  it("deja la descripcion vacia, que es opcional", () => {
    expect(depositSchema.parse({ ...VALID, description: "" }).description).toBe("");
  });

  /**
   * Solo lleva cuenta de destino. El origen lo pone el servidor —la cuenta del
   * mundo exterior— porque si el cliente pudiera elegirlo, cualquiera se
   * transferiria dinero desde la nada.
   */
  it("no acepta una cuenta de origen aunque se la manden", () => {
    const parsed = depositSchema.parse({ ...VALID, fromAccountId: "la-que-sea" });

    expect(parsed).not.toHaveProperty("fromAccountId");
  });

  it.each([
    ["la cuenta de destino no es un uuid", { toAccountId: "../../auth/me" }],
    ["la clave de reintento es elegida a mano", { idempotencyKey: "siempre-la-misma" }],
    ["no hay importe", { amount: "" }],
    ["la descripcion se pasa de 140", { description: "x".repeat(141) }],
  ])("rechaza cuando %s", (_caso, patch) => {
    expect(depositSchema.safeParse({ ...VALID, ...patch }).success).toBe(false);
  });
});
