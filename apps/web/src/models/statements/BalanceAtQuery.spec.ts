import { describe, expect, it } from "vitest";

import { balanceAtQuerySchema } from "./BalanceAtQuery";

const ACCOUNT = "9f1c2b7e-4a3d-4c8e-9b21-6d5f0a7e3c14";

describe("balanceAtQuerySchema", () => {
  /** Sale ya convertida para que nadie tenga que volver a comprobarla despues. */
  it("convierte la fecha en un Date de verdad", () => {
    const { at } = balanceAtQuerySchema.parse({
      accountId: ACCOUNT,
      at: "2026-08-15T23:59:59.999",
    });

    expect(at).toBeInstanceOf(Date);
    expect(at.getFullYear()).toBe(2026);
  });

  it.each([
    ["no es una fecha", "el martes"],
    ["esta vacia", ""],
  ])("rechaza una fecha que %s", (_caso, at) => {
    expect(balanceAtQuerySchema.safeParse({ accountId: ACCOUNT, at }).success).toBe(false);
  });

  /**
   * Un 30 de febrero **no** se rechaza: JavaScript lo desborda al 2 de marzo.
   * Queda escrito porque es lo que hace, no lo que uno esperaria.
   *
   * No se fuerza a rechazarlo porque no hace daño: el campo de la pantalla es un
   * `<input type="date">` y no puede producir esa fecha, y lo peor que consigue
   * quien llame a la accion a mano es ver el saldo de su propia cuenta otro dia.
   */
  it("desborda un dia que no existe en vez de rechazarlo", () => {
    const { at } = balanceAtQuerySchema.parse({
      accountId: ACCOUNT,
      at: "2026-02-30T00:00:00",
    });

    expect(at.getMonth()).toBe(2);
    expect(at.getDate()).toBe(2);
  });

  it("rechaza una cuenta que se sale de la ruta", () => {
    expect(
      balanceAtQuerySchema.safeParse({ accountId: "abc%2Fdef", at: "2026-08-15" }).success,
    ).toBe(false);
  });
});
