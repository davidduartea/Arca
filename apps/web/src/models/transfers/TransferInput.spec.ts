import { describe, expect, it } from "vitest";

import { transferSchema } from "./TransferInput";

const VALID = {
  idempotencyKey: "9f1c2b7e-4a3d-4c8e-9b21-6d5f0a7e3c14",
  fromAccountId: "1b7d3e90-55c1-4a2f-8e6d-0c9a4f2b1d38",
  toAccountNumber: "471820936641",
  amount: "1250.50",
  description: "Alquiler de septiembre",
};

describe("transferSchema", () => {
  it("acepta un movimiento con todo en su sitio", () => {
    expect(transferSchema.safeParse(VALID).success).toBe(true);
  });

  it("deja la descripción vacía, que es opcional", () => {
    expect(transferSchema.parse({ ...VALID, description: "" }).description).toBe("");
  });

  /**
   * La clave de idempotencia es lo que impide cobrar dos veces tras un
   * reintento. Si valiera cualquier texto, se podría elegir una repetida a
   * propósito para que un movimiento se confundiera con otro.
   */
  it("rechaza una clave de reintento que no sea un uuid", () => {
    expect(
      transferSchema.safeParse({ ...VALID, idempotencyKey: "elegida-a-mano" }).success,
    ).toBe(false);
  });

  it.each([
    ["la cuenta de origen no es un uuid", { fromAccountId: "../../auth/me" }],
    ["el número de destino no son doce cifras", { toAccountNumber: "4718" }],
    ["no hay importe", { amount: "" }],
    ["el importe es larguísimo", { amount: "9".repeat(40) }],
    ["la descripción se pasa de 140", { description: "x".repeat(141) }],
  ])("rechaza cuando %s", (_caso, patch) => {
    expect(transferSchema.safeParse({ ...VALID, ...patch }).success).toBe(false);
  });
});
