import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor } from "./cursor";
import { InvalidCursorError } from "./statements.errors";

describe("cursor del extracto", () => {
  const point = { createdAt: new Date("2026-08-26T06:43:34.123Z"), id: randomUUID() };

  it("va y vuelve sin perder nada", () => {
    const roundTrip = decodeCursor(encodeCursor(point));

    expect(roundTrip.id).toBe(point.id);
    expect(roundTrip.createdAt.getTime()).toBe(point.createdAt.getTime());
  });

  it("conserva los milisegundos", () => {
    // Si se perdieran, dos asientos del mismo segundo pasarían a empatar y el
    // cursor dejaría de distinguirlos.
    const roundTrip = decodeCursor(encodeCursor(point));

    expect(roundTrip.createdAt.toISOString()).toBe("2026-08-26T06:43:34.123Z");
  });

  it("es opaco: no se lee el uuid a simple vista", () => {
    // No es seguridad, es contrato: si nadie puede leer dentro, nadie depende
    // del formato y se puede cambiar la clave de paginación sin romper a nadie.
    expect(encodeCursor(point)).not.toContain(point.id);
  });

  it("viaja limpio en una query string", () => {
    // `base64url` no usa `+` ni `/`, que habría que escapar en una URL.
    expect(encodeCursor(point)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rechaza lo que no es un cursor nuestro", () => {
    expect(() => decodeCursor("")).toThrow(InvalidCursorError);
    expect(() => decodeCursor("basura")).toThrow(InvalidCursorError);
    expect(() => decodeCursor("!!!no-es-base64!!!")).toThrow(InvalidCursorError);
  });

  it("rechaza un cursor con la fecha rota", () => {
    const broken = Buffer.from(`no-es-una-fecha|${randomUUID()}`, "utf8").toString("base64url");

    expect(() => decodeCursor(broken)).toThrow(InvalidCursorError);
  });

  it("rechaza un cursor cuyo id no es un uuid", () => {
    const broken = Buffer.from("2026-08-26T06:43:34.123Z|1234", "utf8").toString("base64url");

    expect(() => decodeCursor(broken)).toThrow(InvalidCursorError);
  });

  it("rechaza un cursor con partes de más", () => {
    const broken = Buffer.from(
      `2026-08-26T06:43:34.123Z|${randomUUID()}|sobra`,
      "utf8",
    ).toString("base64url");

    expect(() => decodeCursor(broken)).toThrow(InvalidCursorError);
  });
});
