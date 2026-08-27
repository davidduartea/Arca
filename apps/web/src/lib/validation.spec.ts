import { describe, expect, it } from "vitest";
import { z } from "zod";

import { firstMessage, issuesByField } from "./validation";

const schema = z.object({
  email: z.email("Ese correo no tiene buena pinta."),
  password: z.string().min(12, "La contraseña necesita 12 caracteres o más."),
});

function failureOf(value: unknown): z.ZodError {
  const parsed = schema.safeParse(value);

  if (parsed.success) throw new Error("Se esperaba que fallara");

  return parsed.error;
}

describe("firstMessage", () => {
  it("devuelve el primer problema en palabras", () => {
    expect(
      firstMessage(failureOf({ email: "no-es-un-correo", password: "x".repeat(12) })),
    ).toBe("Ese correo no tiene buena pinta.");
  });

  it("cae en el texto de reserva si el problema no trae mensaje propio", () => {
    const empty = new z.ZodError([]);

    expect(firstMessage(empty)).toBe("Revisa los datos.");
    expect(firstMessage(empty, "Algo falta.")).toBe("Algo falta.");
  });
});

describe("issuesByField", () => {
  it("reparte un mensaje por campo", () => {
    expect(issuesByField(failureOf({ email: "no", password: "corta" }))).toEqual({
      email: "Ese correo no tiene buena pinta.",
      password: "La contraseña necesita 12 caracteres o más.",
    });
  });

  it("se queda con el primero de cada campo: dos frases debajo del mismo campo no se leen", () => {
    const repeated = new z.ZodError([
      { code: "custom", path: ["email"], message: "El primero" },
      { code: "custom", path: ["email"], message: "El segundo" },
    ]);

    expect(issuesByField(repeated)).toEqual({ email: "El primero" });
  });
});
