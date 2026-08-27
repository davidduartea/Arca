import { describe, expect, it } from "vitest";

import {
  copyableAccountNumber,
  formatAccountNumber,
  groupWhileTyping,
  readAccountNumber,
} from "./account-number";

/** Uno real, emitido por el servidor. Su dígito de control cuadra. */
const VALID = "471830905025";

describe("número de arca", () => {
  it("se enseña en grupos de cuatro", () => {
    expect(formatAccountNumber(VALID)).toBe("4718 3090 5025");
  });

  it("se copia con prefijo y guiones", () => {
    // Los guiones lo mantienen de una pieza al pegarlo donde se rompe por los
    // espacios; el prefijo hace que se reconozca de un vistazo.
    expect(copyableAccountNumber(VALID)).toBe("ARCA-4718-3090-5025");
  });

  it("se agrupa mientras se teclea, sin estorbar", () => {
    expect(groupWhileTyping("4718")).toBe("4718");
    expect(groupWhileTyping("47183")).toBe("4718 3");
    expect(groupWhileTyping("471830905025")).toBe("4718 3090 5025");
    expect(groupWhileTyping("4718309050259999")).toBe("4718 3090 5025");
  });

  describe("mientras se escribe", () => {
    it("a medias no es un error, es que falta", () => {
      // Enseñar «no puede existir» antes de la última cifra es regañar a
      // alguien que va por la mitad.
      expect(readAccountNumber("4718").kind).toBe("incomplete");
      expect(readAccountNumber("4718 3090 502").kind).toBe("incomplete");
    });

    it("con las doce y el control cuadrado, vale", () => {
      expect(readAccountNumber(VALID)).toEqual({ kind: "valid", number: VALID });
    });

    it("con las doce y el control torcido, no puede existir", () => {
      const broken = VALID.slice(0, 11) + ((Number(VALID[11]) + 1) % 10);

      expect(readAccountNumber(broken).kind).toBe("impossible");
    });

    it("caza dos cifras intercambiadas, que es el error de copia típico", () => {
      // 3090 tecleado como 3009.
      const swapped = "471830095025";

      expect(readAccountNumber(swapped).kind).toBe("impossible");
    });
  });

  describe("da igual cómo llegue pegado", () => {
    it("con espacios, con guiones o todo junto", () => {
      for (const typed of [VALID, "4718 3090 5025", "4718-3090-5025", "  4718 3090 5025  "]) {
        expect(readAccountNumber(typed)).toEqual({ kind: "valid", number: VALID });
      }
    });

    it("con el prefijo o sin él", () => {
      for (const typed of [`ARCA ${VALID}`, `arca-4718-3090-5025`, `ARCA4718 3090 5025`]) {
        expect(readAccountNumber(typed)).toEqual({ kind: "valid", number: VALID });
      }
    });
  });
});
