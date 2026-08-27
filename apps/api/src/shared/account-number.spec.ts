import { describe, expect, it } from "vitest";

import {
  InvalidAccountNumberError,
  formatAccountNumber,
  generateAccountNumber,
  parseAccountNumber,
} from "./account-number";

describe("número de arca", () => {
  it("son doce cifras y empiezan por el grupo de emisión", () => {
    const number = generateAccountNumber();

    expect(number).toMatch(/^\d{12}$/);
    expect(number.startsWith("4718")).toBe(true);
  });

  it("el que se genera siempre se puede leer", () => {
    for (let i = 0; i < 200; i++) {
      expect(parseAccountNumber(generateAccountNumber())).toMatch(/^\d{12}$/);
    }
  });

  it("no repite: doscientos seguidos son doscientos distintos", () => {
    const seen = new Set(Array.from({ length: 200 }, generateAccountNumber));

    expect(seen.size).toBe(200);
  });

  it("se enseña en grupos de cuatro", () => {
    expect(formatAccountNumber("471820936641")).toBe("4718 2093 6641");
  });

  describe("al leer lo que alguien escribe", () => {
    const number = generateAccountNumber();
    const grouped = formatAccountNumber(number);

    it("da igual cómo venga separado", () => {
      expect(parseAccountNumber(number)).toBe(number);
      expect(parseAccountNumber(grouped)).toBe(number);
      expect(parseAccountNumber(grouped.replaceAll(" ", "-"))).toBe(number);
      expect(parseAccountNumber(`  ${grouped}  `)).toBe(number);
    });

    it("da igual que traiga el prefijo o no", () => {
      expect(parseAccountNumber(`ARCA ${grouped}`)).toBe(number);
      expect(parseAccountNumber(`arca-${number}`)).toBe(number);
      expect(parseAccountNumber(`ARCA${number}`)).toBe(number);
    });

    it("rechaza lo que no tiene doce cifras", () => {
      expect(() => parseAccountNumber("")).toThrow(InvalidAccountNumberError);
      expect(() => parseAccountNumber("4718 2093")).toThrow(InvalidAccountNumberError);
      expect(() => parseAccountNumber(`${number}9`)).toThrow(InvalidAccountNumberError);
      expect(() => parseAccountNumber("4718-2093-664A")).toThrow(InvalidAccountNumberError);
    });
  });

  /**
   * Lo que justifica el dígito de control.
   *
   * Sin él, un número mal copiado llega al servidor y vuelve como «no existe»
   * — o peor, existe y es de otro. Con él, el error se ve en el propio campo.
   */
  describe("el dígito de control", () => {
    it("caza una cifra cambiada, esté donde esté", () => {
      const number = generateAccountNumber();

      for (let position = 0; position < 12; position++) {
        const digit = Number(number[position]);
        const other = (digit + 1) % 10;
        const broken = number.slice(0, position) + other + number.slice(position + 1);

        expect(() => parseAccountNumber(broken)).toThrow(InvalidAccountNumberError);
      }
    });

    it("caza dos cifras contiguas intercambiadas", () => {
      // Es el error de copia más común: teclear 2039 donde ponía 2093. Un mod
      // 10 a secas no lo vería; el mod 11 con pesos distintos sí.
      let checked = 0;

      for (let attempt = 0; attempt < 50; attempt++) {
        const number = generateAccountNumber();

        for (let i = 0; i < 11; i++) {
          if (number[i] === number[i + 1]) continue;

          const swapped = number.slice(0, i) + number[i + 1] + number[i] + number.slice(i + 2);

          expect(() => parseAccountNumber(swapped)).toThrow(InvalidAccountNumberError);
          checked++;
        }
      }

      expect(checked).toBeGreaterThan(300);
    });

    it("deja pasar aproximadamente uno de cada once inventados", () => {
      // Es la otra mitad de su trabajo: quien va probando números al azar
      // falla casi siempre sin llegar a molestar al servidor.
      let accepted = 0;
      const attempts = 3_000;

      for (let i = 0; i < attempts; i++) {
        let candidate = "4718";
        while (candidate.length < 12) candidate += Math.floor(Math.random() * 10).toString();

        try {
          parseAccountNumber(candidate);
          accepted++;
        } catch {
          // Lo esperable.
        }
      }

      const rate = accepted / attempts;
      expect(rate).toBeGreaterThan(0.05);
      expect(rate).toBeLessThan(0.14);
    });
  });
});
