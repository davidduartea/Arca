import { describe, expect, it } from "vitest";

import { join } from "./join";

describe("join", () => {
  it("junta las clases con un espacio", () => {
    expect(join("flex", "items-center")).toBe("flex items-center");
  });

  /**
   * Es para lo que existe. Con una plantilla de texto, un `className` que llega
   * sin valor acaba escrito como la palabra «undefined» dentro del atributo.
   */
  // La tabla va tipada: sin la anotación, `it.each` ensancha el `false` a
  // `boolean` y deja de encajar con lo que `join` acepta.
  const discarded: [string, string | false | null | undefined][] = [
    ["undefined", undefined],
    ["null", null],
    ["false, de una condición que no se cumple", false],
    ["cadena vacía", ""],
  ];

  it.each(discarded)("descarta %s", (_caso, value) => {
    expect(join("flex", value, "gap-s2")).toBe("flex gap-s2");
  });

  it("sin nada que juntar devuelve una cadena vacía", () => {
    expect(join(undefined, false)).toBe("");
  });
});
