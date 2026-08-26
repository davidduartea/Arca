import { randomUUID } from "node:crypto";

import type { TestingModule } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaService } from "../prisma/prisma.service";
import { createTestingModule, truncateAll } from "../test/database";
import { AccountNotFoundError } from "./accounts.errors";
import { AccountsService } from "./accounts.service";

describe("AccountsService", () => {
  let modulo: TestingModule;
  let accounts: AccountsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    modulo = await createTestingModule();
    accounts = modulo.get(AccountsService);
    prisma = modulo.get(PrismaService);
  });

  afterAll(async () => {
    await modulo.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  it("abre una cuenta de persona por defecto", async () => {
    const cuenta = await accounts.open({ ownerId: randomUUID(), name: "Cuenta corriente" });

    expect(cuenta.kind).toBe("USER");
    expect(cuenta.name).toBe("Cuenta corriente");
  });

  it("abre cuentas de sistema cuando se le pide", async () => {
    // Un ingreso desde fuera tiene que salir de algún sitio: sale de una de
    // éstas, que sí puede quedar en negativo.
    const cuenta = await accounts.open({
      ownerId: randomUUID(),
      name: "Mundo exterior",
      kind: "SYSTEM",
    });

    expect(cuenta.kind).toBe("SYSTEM");
  });

  it("la encuentra por su id", async () => {
    const abierta = await accounts.open({ ownerId: randomUUID(), name: "Ahorro" });

    expect((await accounts.byId(abierta.id))?.name).toBe("Ahorro");
  });

  it("devuelve null cuando no existe o el id no es un uuid", async () => {
    expect(await accounts.byId(randomUUID())).toBeNull();

    // Sin la comprobación de forma esto sería un error de casteo de Postgres,
    // que acabaría siendo un 500 en vez de un 404.
    expect(await accounts.byId("no-soy-un-uuid")).toBeNull();
  });

  it("`require` falla en vez de devolver null", async () => {
    await expect(accounts.require(randomUUID())).rejects.toThrow(AccountNotFoundError);
  });

  it("lista las cuentas de un dueño por orden de apertura", async () => {
    const dueno = randomUUID();
    await accounts.open({ ownerId: dueno, name: "Primera" });
    await accounts.open({ ownerId: dueno, name: "Segunda" });
    await accounts.open({ ownerId: randomUUID(), name: "De otro" });

    const suyas = await accounts.byOwner(dueno);

    expect(suyas.map((cuenta) => cuenta.name)).toEqual(["Primera", "Segunda"]);
  });

  it("un dueño sin cuentas, o con un id mal formado, no tiene ninguna", async () => {
    expect(await accounts.byOwner(randomUUID())).toEqual([]);
    expect(await accounts.byOwner("no-soy-un-uuid")).toEqual([]);
  });
});
