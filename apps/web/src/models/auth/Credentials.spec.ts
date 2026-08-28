import { describe, expect, it } from "vitest";

import { PASSWORD_MIN_LENGTH } from "./PasswordPolicy";
import { credentialsSchema, registrationSchema } from "./Credentials";

const LONG_ENOUGH = "caballo verde en la cocina";

describe("credentialsSchema — para entrar", () => {
  it("acepta un correo y una contraseña", () => {
    expect(credentialsSchema.safeParse({ email: "ana@x.com", password: "x" }).success).toBe(
      true,
    );
  });

  /**
   * La política de longitud **no** se aplica al entrar, y es deliberado. El
   * mínimo puede subir algún día, y comprobarlo aquí dejaría fuera a quien abrió
   * su cuenta cuando era menor — sin poder entrar a cambiarla.
   */
  it("acepta una contraseña mas corta que el minimo de registro", () => {
    expect(credentialsSchema.safeParse({ email: "ana@x.com", password: "corta" }).success).toBe(
      true,
    );
  });

  it.each([
    ["el correo no es un correo", { email: "ana", password: "x" }],
    ["falta la contraseña", { email: "ana@x.com", password: "" }],
    ["la contraseña es larguisima", { email: "ana@x.com", password: "x".repeat(201) }],
    ["el correo es larguisimo", { email: `${"a".repeat(250)}@x.com`, password: "x" }],
  ])("rechaza cuando %s", (_caso, value) => {
    expect(credentialsSchema.safeParse(value).success).toBe(false);
  });
});

describe("registrationSchema — para registrarse", () => {
  it("acepta una frase larga y sencilla", () => {
    expect(
      registrationSchema.safeParse({ email: "ana@x.com", password: LONG_ENOUGH }).success,
    ).toBe(true);
  });

  it("exige el minimo justo, ni uno menos", () => {
    const email = "ana@x.com";

    expect(
      registrationSchema.safeParse({ email, password: "x".repeat(PASSWORD_MIN_LENGTH) })
        .success,
    ).toBe(true);
    expect(
      registrationSchema.safeParse({ email, password: "x".repeat(PASSWORD_MIN_LENGTH - 1) })
        .success,
    ).toBe(false);
  });

  /** Ni mayusculas, ni simbolos, ni numeros: esas reglas producen «Password1!». */
  it("no pide nada mas que longitud", () => {
    expect(
      registrationSchema.safeParse({ email: "ana@x.com", password: "aaaaaaaaaaaa" }).success,
    ).toBe(true);
  });
});
