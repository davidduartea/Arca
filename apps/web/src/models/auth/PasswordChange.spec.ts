import { describe, expect, it } from "vitest";

import { PASSWORD_MIN_LENGTH } from "./PasswordPolicy";
import { passwordChangeSchema } from "./PasswordChange";

const CURRENT = "caballo verde en la cocina";
const NEW = "otra frase igual de larga";

describe("passwordChangeSchema", () => {
  it("acepta la de ahora y una nueva larga", () => {
    expect(
      passwordChangeSchema.safeParse({ currentPassword: CURRENT, newPassword: NEW }).success,
    ).toBe(true);
  });

  /**
   * La actual sólo tiene que estar.
   *
   * Medirla con la política dejaría fuera a quien abrió su cuenta cuando el
   * mínimo era menor, y le diría que su contraseña no vale justo en la pantalla
   * donde iba a cambiarla. Es el mismo motivo por el que el acceso tampoco la
   * mide.
   */
  it("no mide la actual, sólo comprueba que esté", () => {
    expect(
      passwordChangeSchema.safeParse({ currentPassword: "corta", newPassword: NEW }).success,
    ).toBe(true);

    expect(
      passwordChangeSchema.safeParse({ currentPassword: "", newPassword: NEW }).success,
    ).toBe(false);
  });

  it("la nueva exige el mínimo justo, ni uno menos", () => {
    expect(
      passwordChangeSchema.safeParse({
        currentPassword: CURRENT,
        newPassword: "x".repeat(PASSWORD_MIN_LENGTH),
      }).success,
    ).toBe(true);

    expect(
      passwordChangeSchema.safeParse({
        currentPassword: CURRENT,
        newPassword: "x".repeat(PASSWORD_MIN_LENGTH - 1),
      }).success,
    ).toBe(false);
  });

  it.each([
    ["falta la actual", { newPassword: NEW }],
    ["falta la nueva", { currentPassword: CURRENT }],
    ["la actual es larguísima", { currentPassword: "x".repeat(201), newPassword: NEW }],
    ["la nueva es larguísima", { currentPassword: CURRENT, newPassword: "x".repeat(201) }],
    ["llega cualquier otra cosa", { currentPassword: 12, newPassword: NEW }],
  ])("rechaza cuando %s", (_caso, value) => {
    expect(passwordChangeSchema.safeParse(value).success).toBe(false);
  });

  /**
   * El mensaje lleva el número dentro.
   *
   * Se comprueba porque se construye con la constante: si el mínimo sube y el
   * texto se quedara con el doce escrito a mano, la pantalla pediría una cosa y
   * el validador exigiría otra.
   */
  it("el mensaje del mínimo dice cuántos hacen falta", () => {
    const parsed = passwordChangeSchema.safeParse({
      currentPassword: CURRENT,
      newPassword: "corta",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain(String(PASSWORD_MIN_LENGTH));
  });

  /** Que no valga la misma lo decide la API: aquí no se conoce la de ahora. */
  it("no compara una con otra", () => {
    expect(
      passwordChangeSchema.safeParse({ currentPassword: CURRENT, newPassword: CURRENT })
        .success,
    ).toBe(true);
  });
});
