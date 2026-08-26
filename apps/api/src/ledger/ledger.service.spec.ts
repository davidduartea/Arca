import { randomUUID } from "node:crypto";

import type { TestingModule } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AccountsService } from "../accounts/accounts.service";
import { PG_CHECK_VIOLATION, readPostgresFailure } from "../prisma/postgres-errors";
import { PrismaService } from "../prisma/prisma.service";
import { createOwner, createTestingModule, truncateAll } from "../test/database";
import {
  AlreadyReversedError,
  IdempotencyKeyReusedError,
  InsufficientEntriesError,
  TransactionNotFoundError,
  UnbalancedTransactionError,
  UnknownAccountError,
  ZeroAmountError,
} from "./ledger.errors";
import { LedgerService } from "./ledger.service";
import type { TransactionDraft } from "./ledger.types";

/**
 * Tests de integración contra Postgres de verdad.
 *
 * No hay dobles porque no los puede haber: lo que se prueba aquí es en buena
 * parte lo que garantiza la propia base — los triggers de la migración — y un
 * doble no tiene triggers. Un test que pasara con un doble no diría nada sobre
 * si el libro cuadra.
 */
describe("LedgerService", () => {
  let moduleRef: TestingModule;
  let ledger: LedgerService;
  let accounts: AccountsService;
  let prisma: PrismaService;

  let source: string;
  let target: string;

  beforeAll(async () => {
    moduleRef = await createTestingModule();
    ledger = moduleRef.get(LedgerService);
    accounts = moduleRef.get(AccountsService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);

    const owner = await createOwner(prisma);
    source = (await accounts.open({ ownerId: owner, name: "Origen" })).id;
    target = (await accounts.open({ ownerId: owner, name: "Destino" })).id;
  });

  /** Una transferencia equilibrada: sale de `origen`, entra en `destino`. */
  const transferOf = (
    cents: bigint,
    extra: Partial<TransactionDraft> = {},
  ): TransactionDraft => ({
    description: `Transferencia de ${cents} centavos`,
    entries: [
      { accountId: source, amount: -cents },
      { accountId: target, amount: cents },
    ],
    ...extra,
  });

  describe("post", () => {
    it("registra los asientos de una transacción equilibrada", async () => {
      const posted = await ledger.post(transferOf(5_000n));

      expect(posted.entries).toHaveLength(2);
      expect(posted.reversesId).toBeNull();

      // Los cargos primero, como en un extracto.
      expect(posted.entries.map((entry) => entry.amount)).toEqual([-5_000n, 5_000n]);
      expect(posted.entries.map((entry) => entry.accountId)).toEqual([source, target]);
    });

    it("acepta transacciones de más de dos asientos", async () => {
      const third = (
        await accounts.open({ ownerId: await createOwner(prisma), name: "Comisión" })
      ).id;

      const posted = await ledger.post({
        description: "Transferencia con comisión",
        entries: [
          { accountId: source, amount: -5_100n },
          { accountId: target, amount: 5_000n },
          { accountId: third, amount: 100n },
        ],
      });

      expect(posted.entries).toHaveLength(3);
      expect(await ledger.balanceOf(source)).toBe(-5_100n);
    });

    it("rechaza una transacción que descuadra", async () => {
      await expect(
        ledger.post({
          description: "Dinero que aparece de la nada",
          entries: [
            { accountId: source, amount: -5_000n },
            { accountId: target, amount: 3_000n },
          ],
        }),
      ).rejects.toThrow(UnbalancedTransactionError);
    });

    it("rechaza una transacción con un solo asiento", async () => {
      await expect(
        ledger.post({
          description: "Media partida",
          entries: [{ accountId: source, amount: -5_000n }],
        }),
      ).rejects.toThrow(InsufficientEntriesError);
    });

    it("rechaza un asiento de importe cero", async () => {
      await expect(
        ledger.post({
          description: "Un movimiento que no mueve nada",
          entries: [
            { accountId: source, amount: 0n },
            { accountId: target, amount: 0n },
          ],
        }),
      ).rejects.toThrow(ZeroAmountError);
    });

    it("rechaza una cuenta que no existe", async () => {
      const ghost = randomUUID();

      await expect(
        ledger.post({
          description: "Contra una cuenta inventada",
          entries: [
            { accountId: source, amount: -5_000n },
            { accountId: ghost, amount: 5_000n },
          ],
        }),
      ).rejects.toThrow(UnknownAccountError);
    });

    it("trata un id mal formado como cuenta desconocida, no como error de la base", async () => {
      await expect(
        ledger.post({
          description: "Contra un id que ni siquiera es un uuid",
          entries: [
            { accountId: source, amount: -5_000n },
            { accountId: "no-soy-un-uuid", amount: 5_000n },
          ],
        }),
      ).rejects.toThrow(UnknownAccountError);
    });

    it("no deja nada escrito cuando rechaza", async () => {
      await expect(
        ledger.post({
          description: "Descuadre",
          entries: [
            { accountId: source, amount: -5_000n },
            { accountId: target, amount: 1n },
          ],
        }),
      ).rejects.toThrow();

      expect(await prisma.transaction.count()).toBe(0);
      expect(await prisma.entry.count()).toBe(0);
    });
  });

  describe("idempotencia", () => {
    it("la misma clave devuelve la transacción original sin crear otra", async () => {
      const draft = transferOf(5_000n, { idempotencyKey: randomUUID() });

      const first = await ledger.post(draft);
      const reintento = await ledger.post(draft);

      expect(reintento.id).toBe(first.id);
      expect(await prisma.transaction.count()).toBe(1);
      expect(await ledger.balanceOf(target)).toBe(5_000n);
    });

    it("dos llamadas a la vez con la misma clave sólo escriben una", async () => {
      const draft = transferOf(5_000n, { idempotencyKey: randomUUID() });

      // Aquí se ejerce el `catch` del índice único: si sólo existiera el
      // chequeo previo, las dos verían «no hay nada» y las dos escribirían.
      const [first, second] = await Promise.all([ledger.post(draft), ledger.post(draft)]);

      expect(first.id).toBe(second.id);
      expect(await prisma.transaction.count()).toBe(1);
      expect(await ledger.balanceOf(target)).toBe(5_000n);
    });

    it("la misma clave con otro contenido es un error", async () => {
      const key = randomUUID();
      await ledger.post(transferOf(5_000n, { idempotencyKey: key }));

      await expect(ledger.post(transferOf(9_999n, { idempotencyKey: key }))).rejects.toThrow(
        IdempotencyKeyReusedError,
      );

      expect(await prisma.transaction.count()).toBe(1);
    });

    it("sin clave, dos llamadas iguales son dos movimientos distintos", async () => {
      const first = await ledger.post(transferOf(5_000n));
      const second = await ledger.post(transferOf(5_000n));

      expect(second.id).not.toBe(first.id);
      expect(await ledger.balanceOf(target)).toBe(10_000n);
    });
  });

  describe("balanceOf", () => {
    it("deriva el saldo sumando los asientos", async () => {
      await ledger.post(transferOf(5_000n));
      await ledger.post(transferOf(2_500n));

      expect(await ledger.balanceOf(source)).toBe(-7_500n);
      expect(await ledger.balanceOf(target)).toBe(7_500n);
    });

    it("una cuenta sin movimientos vale cero", async () => {
      expect(await ledger.balanceOf(source)).toBe(0n);
    });

    it("una cuenta que no existe es un error, no un cero", async () => {
      // Devolver cero sería indistinguible de una cuenta recién abierta.
      await expect(ledger.balanceOf(randomUUID())).rejects.toThrow(UnknownAccountError);
      await expect(ledger.balanceOf("no-soy-un-uuid")).rejects.toThrow(UnknownAccountError);
    });

    it("aguanta importes que se salen de un entero de JavaScript", async () => {
      // 2^53 centavos. Con `number` esto perdería precisión en silencio.
      const huge = 9_007_199_254_740_993n;

      await ledger.post({
        description: "Un importe absurdo, a propósito",
        entries: [
          { accountId: source, amount: -huge },
          { accountId: target, amount: huge },
        ],
      });

      expect(await ledger.balanceOf(target)).toBe(huge);
    });
  });

  describe("reverse", () => {
    it("deja el saldo como estaba", async () => {
      const posted = await ledger.post(transferOf(5_000n));
      expect(await ledger.balanceOf(target)).toBe(5_000n);

      await ledger.reverse(posted.id);

      expect(await ledger.balanceOf(target)).toBe(0n);
      expect(await ledger.balanceOf(source)).toBe(0n);
    });

    it("no borra nada: deja el error escrito y su contrario al lado", async () => {
      const posted = await ledger.post(transferOf(5_000n));
      const reversal = await ledger.reverse(posted.id);

      expect(reversal.reversesId).toBe(posted.id);
      expect(reversal.entries.map((entry) => entry.amount)).toEqual([-5_000n, 5_000n]);

      // Las dos transacciones siguen ahí, con sus cuatro asientos.
      expect(await prisma.transaction.count()).toBe(2);
      expect(await prisma.entry.count()).toBe(4);
    });

    it("hereda la descripción cuando no se le da una", async () => {
      const posted = await ledger.post(transferOf(5_000n));
      const reversal = await ledger.reverse(posted.id);

      expect(reversal.description).toContain(posted.description);
    });

    it("no se puede anular dos veces", async () => {
      const posted = await ledger.post(transferOf(5_000n));
      await ledger.reverse(posted.id);

      await expect(ledger.reverse(posted.id)).rejects.toThrow(AlreadyReversedError);
      expect(await prisma.transaction.count()).toBe(2);
    });

    it("sí se puede anular la anulación", async () => {
      const posted = await ledger.post(transferOf(5_000n));
      const reversal = await ledger.reverse(posted.id);

      await ledger.reverse(reversal.id);

      // Vuelta al punto de partida, con las tres transacciones en el histórico.
      expect(await ledger.balanceOf(target)).toBe(5_000n);
      expect(await prisma.transaction.count()).toBe(3);
    });

    it("una transacción que no existe es un error", async () => {
      await expect(ledger.reverse(randomUUID())).rejects.toThrow(TransactionNotFoundError);
      await expect(ledger.reverse("no-soy-un-uuid")).rejects.toThrow(TransactionNotFoundError);
    });
  });

  /**
   * Escribir dentro de una transacción que abrió otro.
   *
   * Es lo que necesita una transferencia para bloquear las cuentas y escribir
   * los asientos sin soltar el bloqueo en medio.
   */
  describe("postWithin", () => {
    it("escribe dentro de una transacción ajena", async () => {
      await prisma.$transaction((tx) => ledger.postWithin(tx, transferOf(5_000n)));

      expect(await ledger.balanceOf(target)).toBe(5_000n);
    });

    it("permite dos movimientos en la misma transacción", async () => {
      // `SET CONSTRAINTS ALL IMMEDIATE` dura hasta el final de la transacción.
      // Si no se devolviera a diferido, el segundo movimiento fallaría al
      // insertar su primer asiento, cuando la suma todavía no es cero.
      await prisma.$transaction(async (tx) => {
        await ledger.postWithin(tx, transferOf(5_000n));
        await ledger.postWithin(tx, transferOf(2_500n));
      });

      expect(await ledger.balanceOf(target)).toBe(7_500n);
      expect(await prisma.transaction.count()).toBe(2);
    });

    it("si el segundo movimiento falla no queda ni el primero", async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          await ledger.postWithin(tx, transferOf(5_000n));
          await ledger.postWithin(tx, {
            description: "Descuadre",
            entries: [
              { accountId: source, amount: -5_000n },
              { accountId: target, amount: 3_000n },
            ],
          });
        }),
      ).rejects.toThrow(UnbalancedTransactionError);

      expect(await prisma.transaction.count()).toBe(0);
      expect(await prisma.entry.count()).toBe(0);
    });
  });

  describe("byId", () => {
    it("devuelve la transacción con sus asientos", async () => {
      const posted = await ledger.post(transferOf(5_000n));
      const fetched = await ledger.byId(posted.id);

      expect(fetched?.id).toBe(posted.id);
      expect(fetched?.entries).toHaveLength(2);
    });

    it("devuelve null cuando no existe o el id no es un uuid", async () => {
      expect(await ledger.byId(randomUUID())).toBeNull();
      expect(await ledger.byId("no-soy-un-uuid")).toBeNull();
    });
  });

  /**
   * Lo que de verdad protege el libro.
   *
   * Las validaciones del servicio son comodidad: dan un error claro antes de
   * molestar a la base. La garantía son los triggers, y sólo se demuestra
   * saltándose el servicio y escribiendo por debajo.
   */
  describe("la base es la que garantiza, no el servicio", () => {
    it("rechaza un descuadre aunque se escriba por debajo del servicio", async () => {
      // Escritura directa, sin el `SET CONSTRAINTS ALL IMMEDIATE` que hace el
      // servicio: la comprobación diferida salta en el propio COMMIT y Prisma
      // acaba reportando «transaction already closed» en vez de la violación.
      // El motivo se pierde — el rechazo no.
      await expect(
        prisma.transaction.create({
          data: {
            description: "Descuadre por la puerta de atrás",
            entries: {
              createMany: {
                data: [
                  { accountId: source, amount: -5_000n },
                  { accountId: target, amount: 3_000n },
                ],
              },
            },
          },
        }),
      ).rejects.toThrow();

      expect(await prisma.transaction.count()).toBe(0);
      expect(await prisma.entry.count()).toBe(0);
    });

    it("rechaza una transacción de un solo asiento aunque se escriba por debajo", async () => {
      await expect(
        prisma.transaction.create({
          data: {
            description: "Media partida por la puerta de atrás",
            entries: { createMany: { data: [{ accountId: source, amount: -5_000n }] } },
          },
        }),
      ).rejects.toThrow();

      expect(await prisma.transaction.count()).toBe(0);
      expect(await prisma.entry.count()).toBe(0);
    });

    it("rechaza un importe de cero, y ahí sí llega el motivo", async () => {
      // `entries_amount_not_zero` es un CHECK normal, no diferido: salta en el
      // INSERT y no en el COMMIT. Por eso este caso sí trae su SQLSTATE, y es
      // exactamente el contraste que justifica adelantar las comprobaciones en
      // el servicio.
      const failure = await capture(() =>
        prisma.transaction.create({
          data: {
            description: "Un cero por la puerta de atrás",
            entries: {
              createMany: {
                data: [
                  { accountId: source, amount: 0n },
                  { accountId: target, amount: 0n },
                ],
              },
            },
          },
        }),
      );

      expect(readPostgresFailure(failure)?.code).toBe(PG_CHECK_VIOLATION);
      expect(await prisma.transaction.count()).toBe(0);
    });

    it("rechaza editar un asiento", async () => {
      const posted = await ledger.post(transferOf(5_000n));
      const entry = firstEntry(posted.entries);

      await expect(
        prisma.entry.update({ where: { id: entry.id }, data: { amount: 1n } }),
      ).rejects.toThrow();

      // Sigue valiendo lo que valía.
      expect(await ledger.balanceOf(source)).toBe(-5_000n);
    });

    it("rechaza borrar un asiento", async () => {
      const posted = await ledger.post(transferOf(5_000n));
      const entry = firstEntry(posted.entries);

      await expect(prisma.entry.delete({ where: { id: entry.id } })).rejects.toThrow();

      expect(await prisma.entry.count()).toBe(2);
      expect(await ledger.balanceOf(source)).toBe(-5_000n);
    });
  });
});

/** Devuelve el error en vez de dejarlo escapar, para poder inspeccionarlo. */
async function capture(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }

  throw new Error("Se esperaba que fallara y no falló");
}

/** `noUncheckedIndexedAccess` obliga a comprobar; esto lo hace legible. */
function firstEntry<T>(entries: T[]): T {
  const [first] = entries;
  if (first === undefined) throw new Error("La transacción debería tener asientos");

  return first;
}
