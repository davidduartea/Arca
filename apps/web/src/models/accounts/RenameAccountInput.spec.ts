import { describe, expect, it } from "vitest";

import { renameAccountSchema } from "./RenameAccountInput";

const ID = "0f9e5adb-678c-49da-b97f-f602e2e4c8fe";

describe("renameAccountSchema", () => {
  it("acepta un identificador y un nombre, y recorta el nombre", () => {
    const parsed = renameAccountSchema.safeParse({ accountId: ID, name: "  Ahorro  " });

    expect(parsed.success && parsed.data.name).toBe("Ahorro");
  });

  /**
   * El identificador viaja dentro de la ruta que se le pide a la API. Sin
   * comprobarlo, un `..` convertiría `/accounts/<id>` en otra dirección pedida
   * con la sesión de quien mira, y por PATCH.
   */
  it.each([
    ["una barra", "abc/def"],
    ["subir un nivel", "../../auth/logout-all"],
    ["una ruta entera", `${ID}/../../accounts`],
    ["esta vacio", ""],
  ])("rechaza el identificador cuando trae %s", (_caso, accountId) => {
    expect(renameAccountSchema.safeParse({ accountId, name: "Ahorro" }).success).toBe(false);
  });

  it.each([
    ["esta vacio", ""],
    ["son espacios", "   "],
    ["es larguisimo", "a".repeat(81)],
  ])("rechaza el nombre cuando %s", (_caso, name) => {
    expect(renameAccountSchema.safeParse({ accountId: ID, name }).success).toBe(false);
  });

  it("el mensaje no enseña lo que se escribio", () => {
    const parsed = renameAccountSchema.safeParse({
      accountId: "../../auth/logout-all",
      name: "Ahorro",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).not.toContain("logout-all");
  });
});
