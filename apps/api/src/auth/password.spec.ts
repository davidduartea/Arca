import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

const PASSWORD = "una-contraseña-larga";

describe("password", () => {
  it("una contraseña se verifica contra su propio hash", async () => {
    const hash = await hashPassword(PASSWORD);

    expect(await verifyPassword(PASSWORD, hash)).toBe(true);
  });

  it("otra contraseña no", async () => {
    const hash = await hashPassword(PASSWORD);

    expect(await verifyPassword("otra-contraseña-larga", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("la misma contraseña da hashes distintos cada vez", async () => {
    // Es la sal. Sin ella, dos personas con la misma contraseña tendrían el
    // mismo hash, y una filtración diría de un vistazo quién comparte cuál.
    const uno = await hashPassword(PASSWORD);
    const otro = await hashPassword(PASSWORD);

    expect(uno).not.toBe(otro);
    expect(await verifyPassword(PASSWORD, uno)).toBe(true);
    expect(await verifyPassword(PASSWORD, otro)).toBe(true);
  });

  it("el hash lleva dentro sus parámetros", async () => {
    // Van en el propio hash para poder endurecerlos mañana sin invalidar las
    // contraseñas de todo el mundo: las viejas se siguen verificando con los
    // suyos.
    const [etiqueta, coste, bloque, paralelismo] = (await hashPassword(PASSWORD)).split("$");

    expect(etiqueta).toBe("scrypt");
    expect(Number(coste)).toBe(2 ** 16);
    expect(Number(bloque)).toBe(8);
    expect(Number(paralelismo)).toBe(2);
  });

  it("no deja rastro de la contraseña", async () => {
    const hash = await hashPassword(PASSWORD);

    expect(hash).not.toContain(PASSWORD);
    expect(hash).not.toContain("contraseña");
  });

  describe("ante un hash que no vale", () => {
    // Devuelve `false` en vez de lanzar: para quien pregunta el resultado es el
    // mismo — esa contraseña no sirve — y así un registro dañado no tumba el
    // proceso ni distingue «hash roto» de «contraseña incorrecta».
    it("rechaza el vacío y la basura", async () => {
      expect(await verifyPassword(PASSWORD, "")).toBe(false);
      expect(await verifyPassword(PASSWORD, "basura")).toBe(false);
      expect(await verifyPassword(PASSWORD, "$$$$$")).toBe(false);
    });

    it("rechaza el que usa el usuario del sistema", async () => {
      // La migración le pone `sin-acceso`: cumple el CHECK de hash no vacío y
      // no tiene la forma que esto exige, así que nada coincide con él.
      expect(await verifyPassword(PASSWORD, "sin-acceso")).toBe(false);
      expect(await verifyPassword("sin-acceso", "sin-acceso")).toBe(false);
    });

    it("rechaza otro algoritmo aunque tenga la forma correcta", async () => {
      const ajeno = (await hashPassword(PASSWORD)).replace("scrypt$", "bcrypt$");

      expect(await verifyPassword(PASSWORD, ajeno)).toBe(false);
    });

    it("rechaza parámetros que no son números positivos", async () => {
      const real = await hashPassword(PASSWORD);
      const [, , bloque, paralelismo, sal, clave] = real.split("$");

      expect(
        await verifyPassword(
          PASSWORD,
          ["scrypt", "0", bloque, paralelismo, sal, clave].join("$"),
        ),
      ).toBe(false);
      expect(
        await verifyPassword(
          PASSWORD,
          ["scrypt", "abc", bloque, paralelismo, sal, clave].join("$"),
        ),
      ).toBe(false);
      expect(
        await verifyPassword(
          PASSWORD,
          ["scrypt", "-1", bloque, paralelismo, sal, clave].join("$"),
        ),
      ).toBe(false);
    });

    it("rechaza una clave de longitud distinta", async () => {
      // `timingSafeEqual` lanza si los buffers no miden lo mismo, así que la
      // longitud se comprueba antes.
      const real = await hashPassword(PASSWORD);
      const partes = real.split("$");
      partes[5] = "corta";

      expect(await verifyPassword(PASSWORD, partes.join("$"))).toBe(false);
    });
  });
});
