import { describe, expect, it } from "vitest";

import { transactionIdSchema } from "./TransactionId";

describe("transactionIdSchema", () => {
  it("acepta un uuid", () => {
    expect(transactionIdSchema.safeParse("0f9e5adb-678c-49da-b97f-f602e2e4c8fe").success).toBe(
      true,
    );
  });

  /**
   * Lo que de verdad guarda este esquema.
   *
   * El valor viaja dentro de la ruta que pide anular. Sin comprobarlo, una
   * barra o un `..` convertirían `/transactions/<id>/reversal` en otra
   * dirección de la API, pedida con la sesión de quien mira y por POST.
   */
  it.each([
    ["una barra", "abc/def"],
    ["subir un nivel", "../../auth/logout-all"],
    ["una ruta entera", "0f9e5adb-678c-49da-b97f-f602e2e4c8fe/../../accounts"],
    ["está vacío", ""],
    ["es un número", 12],
    ["falta", undefined],
    ["casi un uuid", "0f9e5adb-678c-49da-b97f-f602e2e4c8f"],
  ])("rechaza cuando %s", (_caso, value) => {
    expect(transactionIdSchema.safeParse(value).success).toBe(false);
  });

  it("el mensaje no enseña lo que se escribió", () => {
    const parsed = transactionIdSchema.safeParse("../../auth/logout-all");

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).not.toContain("logout-all");
  });
});
