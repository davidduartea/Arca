import { describe, expect, it } from "vitest";

import { TokenService } from "../auth/token.service";
import { trackerFor } from "./rate-limit";

const tokens = new TokenService("un-secreto-de-pruebas-suficientemente-largo");

const ANA = { id: "0f9e5adb-678c-49da-b97f-f602e2e4c8fe", email: "ana@arca.test", name: "Ana" };

const requestFrom = (ip: string, authorization?: string) => ({
  ip,
  headers: authorization === undefined ? {} : { authorization },
});

describe("trackerFor", () => {
  it("sin sesión cuenta por dirección", async () => {
    expect(await trackerFor(requestFrom("10.0.0.7"), tokens)).toBe("ip:10.0.0.7");
  });

  it("con sesión cuenta por persona", async () => {
    const token = await tokens.issue(ANA, 0);

    expect(await trackerFor(requestFrom("10.0.0.7", `Bearer ${token}`), tokens)).toBe(
      `user:${ANA.id}`,
    );
  });

  /**
   * La misma dirección, dos sesiones, dos cupos.
   *
   * Es todo el motivo de que esto exista: detrás de un NAT cientos de personas
   * comparten IP, y contar por IP deja fuera a quien no ha hecho nada.
   */
  it("dos personas desde la misma dirección no comparten cupo", async () => {
    const otra = { ...ANA, id: "11111111-2222-4333-8444-555555555555" };
    const mine = await tokens.issue(ANA, 0);
    const theirs = await tokens.issue(otra, 0);

    const one = await trackerFor(requestFrom("10.0.0.7", `Bearer ${mine}`), tokens);
    const two = await trackerFor(requestFrom("10.0.0.7", `Bearer ${theirs}`), tokens);

    expect(one).not.toBe(two);
  });

  /**
   * Lo que hace que el limitador sirva de algo.
   *
   * Si el identificador se leyera sin comprobar la firma, cualquiera escribiría
   * un `sub` distinto en cada petición y estrenaría cupo cada vez.
   */
  it("un token firmado con otro secreto no identifica a nadie", async () => {
    const impostor = new TokenService("otro-secreto-igual-de-largo-pero-distinto");
    const token = await impostor.issue(ANA, 0);

    expect(await trackerFor(requestFrom("10.0.0.7", `Bearer ${token}`), tokens)).toBe(
      "ip:10.0.0.7",
    );
  });

  it.each([
    ["no hay cabecera", undefined],
    ["no dice Bearer", "Basic YWJj"],
    ["dice Bearer y nada más", "Bearer "],
    ["no es un token", "Bearer no-soy-un-jwt"],
  ])("cae a la dirección cuando %s", async (_caso, authorization) => {
    expect(await trackerFor(requestFrom("10.0.0.7", authorization), tokens)).toBe(
      "ip:10.0.0.7",
    );
  });

  it("sin dirección tampoco se queda sin cubo", async () => {
    expect(await trackerFor({ headers: {} }, tokens)).toBe("ip:desconocida");
  });

  it("una petición sin cabeceras no revienta", async () => {
    expect(await trackerFor({ ip: "10.0.0.7" }, tokens)).toBe("ip:10.0.0.7");
  });
});
