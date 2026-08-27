import { describe, expect, it } from "vitest";

import {
  InvalidAmountError,
  centsToTyped,
  dollarsToCents,
  formatSigned,
  formatUsd,
} from "./money";

describe("formatUsd", () => {
  it("pone los dos decimales y el separador de miles", () => {
    expect(formatUsd("125000")).toBe("$1,250.00");
    expect(formatUsd("100")).toBe("$1.00");
    expect(formatUsd("5")).toBe("$0.05");
  });

  it("el cero es un estado normal y se escribe", () => {
    expect(formatUsd("0")).toBe("$0.00");
  });

  it("usa el menos tipográfico, que alinea con las cifras", () => {
    expect(formatUsd("-110000")).toBe("−$1,100.00");
  });

  it("aguanta importes que no caben en un entero de JavaScript", () => {
    // 2^53 + 1 centavos. Con `number` esto habría perdido el último dígito.
    expect(formatUsd("9007199254740993")).toBe("$90,071,992,547,409.93");
  });
});

describe("formatSigned", () => {
  it("lo que entra lleva signo más; lo que sale, menos", () => {
    expect(formatSigned("300000")).toBe("+$3,000.00");
    expect(formatSigned("-110000")).toBe("−$1,100.00");
  });
});

describe("dollarsToCents", () => {
  it("convierte lo que se escribe en un campo", () => {
    expect(dollarsToCents("1250.50")).toBe("125050");
    expect(dollarsToCents("1250")).toBe("125000");
    expect(dollarsToCents("0.05")).toBe("5");
  });

  it("un decimal solo se completa a dos", () => {
    expect(dollarsToCents("1250.5")).toBe("125050");
  });

  it("acepta la coma como separador decimal, y el punto también", () => {
    expect(dollarsToCents("1250,50")).toBe("125050");
    expect(dollarsToCents("1250.50")).toBe("125050");
  });

  it("perdona el símbolo y los espacios", () => {
    expect(dollarsToCents(" $1250.50 ")).toBe("125050");
  });

  it("rechaza el separador de miles en vez de adivinarlo", () => {
    // `1.250` es mil doscientos cincuenta en castellano y uno con veinticinco
    // en inglés. Con dinero eso no se adivina: se pide claridad.
    expect(() => dollarsToCents("1,250.50")).toThrow(InvalidAmountError);
    expect(() => dollarsToCents("1.250")).toThrow(InvalidAmountError);
  });

  it("no pasa por coma flotante", () => {
    // `parseFloat("1250.5") * 100` da 125049.99999999999 en algunos motores.
    // Al hacerse con texto, esto es exacto por construcción.
    expect(dollarsToCents("1250.5")).toBe("125050");
    expect(dollarsToCents("0.29")).toBe("29");
    expect(dollarsToCents("8.11")).toBe("811");
  });

  it("rechaza lo que no es un importe positivo", () => {
    expect(() => dollarsToCents("")).toThrow(InvalidAmountError);
    expect(() => dollarsToCents("abc")).toThrow(InvalidAmountError);
    expect(() => dollarsToCents("-100")).toThrow(InvalidAmountError);
    expect(() => dollarsToCents("1.234")).toThrow(InvalidAmountError);
  });

  it("rechaza el cero: un movimiento que no mueve nada", () => {
    expect(() => dollarsToCents("0")).toThrow(InvalidAmountError);
    expect(() => dollarsToCents("0.00")).toThrow(InvalidAmountError);
  });
});

describe("centsToTyped", () => {
  it("va y vuelve sin perder nada", () => {
    for (const cents of ["1", "5", "100", "125050", "9007199254740993"]) {
      expect(dollarsToCents(centsToTyped(cents))).toBe(cents);
    }
  });
});
