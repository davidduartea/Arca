import { describe, expect, it } from "vitest";

import { accountNumberSchema } from "./AccountNumber";

describe("accountNumberSchema", () => {
  it("acepta doce cifras", () => {
    expect(accountNumberSchema.parse("471820936641")).toBe("471820936641");
  });

  it("quita los espacios de los lados, que llegan al pegar", () => {
    expect(accountNumberSchema.parse("  471820936641  ")).toBe("471820936641");
  });

  it.each([
    ["once cifras", "47182093664"],
    ["trece cifras", "4718209366411"],
    ["cifras con espacios dentro", "4718 2093 6641"],
    ["el prefijo pegado", "ARCA471820936641"],
    ["letras", "47182093664a"],
    ["una consulta escondida", "471820936641?x=1"],
    ["nada", ""],
  ])("rechaza %s", (_caso, value) => {
    expect(accountNumberSchema.safeParse(value).success).toBe(false);
  });
});
