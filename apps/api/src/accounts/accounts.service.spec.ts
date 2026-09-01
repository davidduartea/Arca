import { randomUUID } from "node:crypto";

import type { TestingModule } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { NotYourAccountError } from "../auth/auth.errors";
import { UnknownAccountError } from "../ledger/ledger.errors";
import { PrismaService } from "../prisma/prisma.service";
import { createOwner, createTestingModule, truncateAll } from "../test/database";
import { AccountsService } from "./accounts.service";

describe("AccountsService", () => {
  let moduleRef: TestingModule;
  let accounts: AccountsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await createTestingModule();
    accounts = moduleRef.get(AccountsService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  it("abre una cuenta de persona por defecto", async () => {
    const account = await accounts.open({
      ownerId: await createOwner(prisma),
      name: "Cuenta corriente",
    });

    expect(account.kind).toBe("USER");
    expect(account.name).toBe("Cuenta corriente");
  });

  it("abre cuentas de sistema cuando se le pide", async () => {
    // Un ingreso desde fuera tiene que salir de algún sitio: sale de una de
    // éstas, que sí puede quedar en negativo.
    const account = await accounts.open({
      ownerId: await createOwner(prisma),
      name: "Mundo exterior",
      kind: "SYSTEM",
    });

    expect(account.kind).toBe("SYSTEM");
  });

  it("la encuentra por su id", async () => {
    const opened = await accounts.open({ ownerId: await createOwner(prisma), name: "Ahorro" });

    expect((await accounts.byId(opened.id))?.name).toBe("Ahorro");
  });

  it("devuelve null cuando no existe o el id no es un uuid", async () => {
    expect(await accounts.byId(randomUUID())).toBeNull();

    // Sin la comprobación de forma esto sería un error de casteo de Postgres,
    // que acabaría siendo un 500 en vez de un 404.
    expect(await accounts.byId("no-soy-un-uuid")).toBeNull();
  });

  describe("requireOwnedBy", () => {
    it("devuelve la cuenta a su dueño", async () => {
      const owner = await createOwner(prisma);
      const account = await accounts.open({ ownerId: owner, name: "Ahorro" });

      expect((await accounts.requireOwnedBy(account.id, owner)).name).toBe("Ahorro");
    });

    it("una cuenta que no existe es un error", async () => {
      await expect(
        accounts.requireOwnedBy(randomUUID(), await createOwner(prisma)),
      ).rejects.toThrow(UnknownAccountError);
    });

    it("distingue «no existe» de «no es tuya»", async () => {
      // El dominio los separa porque para registrar y depurar son cosas
      // distintas. La capa HTTP los colapsa a propósito en un mismo 404.
      const account = await accounts.open({
        ownerId: await createOwner(prisma),
        name: "De otro",
      });

      await expect(
        accounts.requireOwnedBy(account.id, await createOwner(prisma)),
      ).rejects.toThrow(NotYourAccountError);
    });
  });

  it("lista las cuentas de un dueño por orden de apertura", async () => {
    const owner = await createOwner(prisma);
    await accounts.open({ ownerId: owner, name: "Primera" });
    await accounts.open({ ownerId: owner, name: "Segunda" });
    await accounts.open({ ownerId: await createOwner(prisma), name: "De otro" });

    const theirs = await accounts.byOwner(owner);

    expect(theirs.map((account) => account.name)).toEqual(["Primera", "Segunda"]);
  });

  it("un dueño sin cuentas, o con un id mal formado, no tiene ninguna", async () => {
    expect(await accounts.byOwner(randomUUID())).toEqual([]);
    expect(await accounts.byOwner("no-soy-un-uuid")).toEqual([]);
  });
});
