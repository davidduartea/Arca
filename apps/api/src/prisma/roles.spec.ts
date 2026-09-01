import type { TestingModule } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AccountsService } from "../accounts/accounts.service";
import { LedgerService } from "../ledger/ledger.service";
import { createOwner, createTestingModule, truncateAll } from "../test/database";
import { PrismaService } from "./prisma.service";
import { ReaderService } from "./reader.service";

/**
 * La frontera entre los dos roles, comprobada contra Postgres.
 *
 * Todo lo demás de esta suite prueba que la aplicación hace lo que dice. Esto
 * prueba lo contrario: que **cuando la aplicación se equivoque**, la base no la
 * siga. Por eso los casos de aquí escriben a propósito las consultas mal —sin el
 * filtro por dueño, tocando lo que no toca— y esperan que salgan vacías o que
 * salte un permiso.
 *
 * Si algún día alguien concede un privilegio de más «para que pase el test», es
 * este archivo el que se pondrá rojo, y es exactamente lo que tiene que pasar.
 */
describe("Los dos roles", () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let reader: ReaderService;
  let accounts: AccountsService;
  let ledger: LedgerService;

  let world: string;
  let ana: string;
  let anaId: string;
  let beto: string;
  let betoId: string;

  beforeAll(async () => {
    moduleRef = await createTestingModule();
    prisma = moduleRef.get(PrismaService);
    reader = moduleRef.get(ReaderService);
    accounts = moduleRef.get(AccountsService);
    ledger = moduleRef.get(LedgerService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await truncateAll();

    world = (
      await accounts.open({ ownerId: await createOwner(prisma), name: "Mundo", kind: "SYSTEM" })
    ).id;

    anaId = await createOwner(prisma);
    ana = (await accounts.open({ ownerId: anaId, name: "de Ana" })).id;

    betoId = await createOwner(prisma);
    beto = (await accounts.open({ ownerId: betoId, name: "de Beto" })).id;

    // Beto tiene 9.500 y Ana no tiene nada. Los números importan más abajo.
    await ledger.post({
      description: "Ingreso de Beto",
      entries: [
        { accountId: world, amount: -9_500n },
        { accountId: beto, amount: 9_500n },
      ],
    });
  });

  describe("el lector sólo ve lo suyo", () => {
    /**
     * El caso que justifica todo el montaje.
     *
     * La consulta está escrita **sin filtro por dueño**, que es el fallo que se
     * teme: alguien escribe `findMany({})` y se le olvida el `where`. Con la
     * conexión de antes eso devolvía el libro entero. Ahora devuelve lo de quien
     * pregunta, porque el filtro no está en la consulta — está en el permiso.
     */
    it("una consulta a la que se le olvidó el filtro sigue devolviendo sólo lo tuyo", async () => {
      const todas = await reader.asUser(anaId, (db) => db.account.findMany());

      expect(todas.map((account) => account.name)).toEqual(["de Ana"]);
    });

    it("el saldo de otro sale vacío, no equivocado", async () => {
      const suyo = await reader.asUser(anaId, (db) =>
        db.entry.aggregate({ _sum: { amount: true }, where: { accountId: beto } }),
      );

      // Nulo, que es «no hay filas», y no un número que parezca un saldo.
      expect(suyo._sum.amount).toBeNull();

      // Y para su dueño, el de verdad.
      const deBeto = await reader.asUser(betoId, (db) =>
        db.entry.aggregate({ _sum: { amount: true }, where: { accountId: beto } }),
      );

      expect(deBeto._sum.amount).toBe(9_500n);
    });

    it("no alcanza los asientos ni los movimientos de otro", async () => {
      const visto = await reader.asUser(anaId, async (db) => ({
        asientos: await db.entry.count(),
        movimientos: await db.transaction.count(),
        usuarios: await db.user.count(),
      }));

      // Ana no participó en el ingreso de Beto, así que no ve ni el asiento, ni
      // la transacción que lo agrupa, ni a Beto.
      expect(visto).toEqual({ asientos: 0, movimientos: 0, usuarios: 1 });
    });

    /**
     * Las dos partes de una transferencia sí la ven, y es lo correcto: le pasó
     * a las dos. Lo que no cruza es el asiento del otro — cuánto tenía y en qué
     * cuenta le cayó.
     */
    it("de un movimiento compartido, cada uno ve su mitad", async () => {
      await ledger.post({
        description: "Un pago",
        entries: [
          { accountId: beto, amount: -1_000n },
          { accountId: ana, amount: 1_000n },
        ],
      });

      const paraAna = await reader.asUser(anaId, (db) =>
        db.entry.findMany({ where: { transaction: { description: "Un pago" } } }),
      );

      expect(paraAna).toHaveLength(1);
      expect(paraAna[0]?.amount).toBe(1_000n);
      expect(paraAna[0]?.accountId).toBe(ana);

      const movimientos = await reader.asUser(anaId, (db) =>
        db.transaction.findMany({ where: { description: "Un pago" } }),
      );

      expect(movimientos).toHaveLength(1);
    });

    /**
     * Cerrado por defecto.
     *
     * Las políticas comparan con `arca.user_id`, y sin ese ajuste puesto la
     * comparación es contra nulo: falsa para toda fila. Una consulta que se
     * saltara `asUser` no se lleva el libro entero — se lleva nada.
     */
    it("sin decir quién pregunta no ve absolutamente nada", async () => {
      const cuentas = await reader.account.findMany();
      const asientos = await reader.entry.count();

      expect(cuentas).toEqual([]);
      expect(asientos).toBe(0);
    });

    it("no puede escribir aunque se lo pidan", async () => {
      await expect(
        reader.asUser(anaId, (db) =>
          db.account.update({ where: { id: ana }, data: { name: "otro" } }),
        ),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  describe("el libro puede mover dinero pero no reescribirlo", () => {
    /**
     * Lo que la política por dueño rompía, y por lo que hay dos roles.
     *
     * Una transferencia bloquea las dos cuentas y le escribe un asiento a la
     * del destinatario. Con RLS por dueño esto devolvía UNA fila sin dar error,
     * y el bloqueo sobre la cuenta ajena desaparecía en silencio.
     */
    it("bloquea las dos cuentas de una transferencia, no una", async () => {
      const bloqueadas = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM "accounts" WHERE id IN ('${ana}'::uuid, '${beto}'::uuid) FOR UPDATE`,
      );

      expect(bloqueadas).toHaveLength(2);
    });

    it("y ve el saldo de la cuenta que cobró, que es lo que mira una anulación", async () => {
      const { _sum } = await prisma.entry.aggregate({
        _sum: { amount: true },
        where: { accountId: beto },
      });

      expect(_sum.amount).toBe(9_500n);
    });

    /**
     * La garantía que más importa de este cambio.
     *
     * Un asiento se escribe una vez. Antes lo sujetaba sólo un trigger, y un
     * trigger lo quita quien sea dueño de la tabla — que era la aplicación. Ya
     * no lo es, y encima no tiene el privilegio: ni una inyección de SQL con
     * esta conexión podría cambiar un importe ya escrito.
     */
    it("no puede cambiar un importe ya asentado", async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "entries" SET amount = 1 WHERE account_id = '${beto}'`,
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it("no puede borrar un asiento", async () => {
      await expect(
        prisma.$executeRawUnsafe(`DELETE FROM "entries" WHERE account_id = '${beto}'`),
      ).rejects.toThrow(/permission denied/i);
    });

    it("no puede vaciar la tabla, que es borrar por la puerta de atrás", async () => {
      await expect(
        prisma.$executeRawUnsafe('TRUNCATE TABLE "entries" CASCADE'),
      ).rejects.toThrow(/permission denied/i);
    });

    /** Cambiar el dueño de una cuenta es quedarse con ella y con su saldo. */
    it("no puede cambiarle el dueño a una cuenta", async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "accounts" SET owner_id = '${anaId}'::uuid WHERE id = '${beto}'::uuid`,
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    /** El correo es con lo que se entra: moverlo es apropiarse de la cuenta. */
    it("no puede cambiar el correo de acceso de nadie", async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "users" SET email = 'otro@arca.test' WHERE id = '${betoId}'::uuid`,
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it("no puede tirar los triggers que garantizan el libro", async () => {
      await expect(
        prisma.$executeRawUnsafe('DROP TRIGGER "entries_must_balance" ON "entries"'),
      ).rejects.toThrow(/must be owner/i);

      await expect(
        prisma.$executeRawUnsafe('DROP TRIGGER "entries_are_immutable" ON "entries"'),
      ).rejects.toThrow(/must be owner/i);
    });

    it("no puede apagar las políticas para ver más", async () => {
      await expect(
        prisma.$executeRawUnsafe('ALTER TABLE "accounts" DISABLE ROW LEVEL SECURITY'),
      ).rejects.toThrow(/must be owner/i);
    });
  });
});
