import { describe, expect, it } from "vitest";

import { openAccountSchema } from "./OpenAccountInput";

describe("openAccountSchema", () => {
  it("acepta un nombre y le quita los espacios de los lados", () => {
    expect(openAccountSchema.parse({ name: "  Ahorro para el viaje  " }).name).toBe(
      "Ahorro para el viaje",
    );
  });

  it("rechaza un nombre vacio, y tambien uno que solo son espacios", () => {
    expect(openAccountSchema.safeParse({ name: "" }).success).toBe(false);
    expect(openAccountSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  /** El maxLength del campo es una comodidad y se salta con dos lineas en la consola. */
  it("rechaza un nombre de mas de 80", () => {
    expect(openAccountSchema.safeParse({ name: "x".repeat(80) }).success).toBe(true);
    expect(openAccountSchema.safeParse({ name: "x".repeat(81) }).success).toBe(false);
  });
});
