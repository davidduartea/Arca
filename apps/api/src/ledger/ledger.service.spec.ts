import { randomUUID } from "node:crypto";

import type { TestingModule } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AccountsService } from "../accounts/accounts.service";
import { PG_CHECK_VIOLATION, readPostgresFailure } from "../prisma/postgres-errors";
import { PrismaService } from "../prisma/prisma.service";
import { createTestingModule, truncateAll } from "../test/database";
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
  let modulo: TestingModule;
  let ledger: LedgerService;
  let accounts: AccountsService;
  let prisma: PrismaService;

  let origen: string;
  let destino: string;

  beforeAll(async () => {
    modulo = await createTestingModule();
    ledger = modulo.get(LedgerService);
    accounts = modulo.get(AccountsService);
    prisma = modulo.get(PrismaService);
  });

  afterAll(async () => {
    await modulo.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);

    const dueno = randomUUID();
    origen = (await accounts.open({ ownerId: dueno, name: "Origen" })).id;
    destino = (await accounts.open({ ownerId: dueno, name: "Destino" })).id;
  });

  /** Una transferencia equilibrada: sale de `origen`, entra en `destino`. */
  const transferencia = (
    centavos: bigint,
    extra: Partial<TransactionDraft> = {},
  ): TransactionDraft => ({
    description: `Transferencia de ${centavos} centavos`,
    entries: [
      { accountId: origen, amount: -centavos },
      { accountId: destino, amount: centavos },
    ],
    ...extra,
  });

  describe("post", () => {
    it("registra los asientos de una transacción equilibrada", async () => {
      const movimiento = await ledger.post(transferencia(5_000n));

      expect(movimiento.entries).toHaveLength(2);
      expect(movimiento.reversesId).toBeNull();

      // Los cargos primero, como en un extracto.
      expect(movimiento.entries.map((asiento) => asiento.amount)).toEqual([-5_000n, 5_000n]);
      expect(movimiento.entries.map((asiento) => asiento.accountId)).toEqual([origen, destino]);
    });

    it("acepta transacciones de más de dos asientos", async () => {
      const tercera = (await accounts.open({ ownerId: randomUUID(), name: "Comisión" })).id;

      const movimiento = await ledger.post({
        description: "Transferencia con comisión",
        entries: [
          { accountId: origen, amount: -5_100n },
          { accountId: destino, amount: 5_000n },
          { accountId: tercera, amount: 100n },
        ],
      });

      expect(movimiento.entries).toHaveLength(3);
      expect(await ledger.balanceOf(origen)).toBe(-5_100n);
    });

    it("rechaza una transacción que descuadra", async () => {
      await expect(
        ledger.post({
          description: "Dinero que aparece de la nada",
          entries: [
            { accountId: origen, amount: -5_000n },
            { accountId: destino, amount: 3_000n },
          ],
        }),
      ).rejects.toThrow(UnbalancedTransactionError);
    });

    it("rechaza una transacción con un solo asiento", async () => {
      await expect(
        ledger.post({
          description: "Media partida",
          entries: [{ accountId: origen, amount: -5_000n }],
        }),
      ).rejects.toThrow(InsufficientEntriesError);
    });

    it("rechaza un asiento de importe cero", async () => {
      await expect(
        ledger.post({
          description: "Un movimiento que no mueve nada",
          entries: [
            { accountId: origen, amount: 0n },
            { accountId: destino, amount: 0n },
          ],
        }),
      ).rejects.toThrow(ZeroAmountError);
    });

    it("rechaza una cuenta que no existe", async () => {
      const fantasma = randomUUID();

      await expect(
        ledger.post({
          description: "Contra una cuenta inventada",
          entries: [
            { accountId: origen, amount: -5_000n },
            { accountId: fantasma, amount: 5_000n },
          ],
        }),
      ).rejects.toThrow(UnknownAccountError);
    });

    it("trata un id mal formado como cuenta desconocida, no como error de la base", async () => {
      await expect(
        ledger.post({
          description: "Contra un id que ni siquiera es un uuid",
          entries: [
            { accountId: origen, amount: -5_000n },
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
            { accountId: origen, amount: -5_000n },
            { accountId: destino, amount: 1n },
          ],
        }),
      ).rejects.toThrow();

      expect(await prisma.transaction.count()).toBe(0);
      expect(await prisma.entry.count()).toBe(0);
    });
  });

  describe("idempotencia", () => {
    it("la misma clave devuelve la transacción original sin crear otra", async () => {
      const draft = transferencia(5_000n, { idempotencyKey: randomUUID() });

      const primera = await ledger.post(draft);
      const reintento = await ledger.post(draft);

      expect(reintento.id).toBe(primera.id);
      expect(await prisma.transaction.count()).toBe(1);
      expect(await ledger.balanceOf(destino)).toBe(5_000n);
    });

    it("dos llamadas a la vez con la misma clave sólo escriben una", async () => {
      const draft = transferencia(5_000n, { idempotencyKey: randomUUID() });

      // Aquí se ejerce el `catch` del índice único: si sólo existiera el
      // chequeo previo, las dos verían «no hay nada» y las dos escribirían.
      const [una, otra] = await Promise.all([ledger.post(draft), ledger.post(draft)]);

      expect(una.id).toBe(otra.id);
      expect(await prisma.transaction.count()).toBe(1);
      expect(await ledger.balanceOf(destino)).toBe(5_000n);
    });

    it("la misma clave con otro contenido es un error", async () => {
      const clave = randomUUID();
      await ledger.post(transferencia(5_000n, { idempotencyKey: clave }));

      await expect(
        ledger.post(transferencia(9_999n, { idempotencyKey: clave })),
      ).rejects.toThrow(IdempotencyKeyReusedError);

      expect(await prisma.transaction.count()).toBe(1);
    });

    it("sin clave, dos llamadas iguales son dos movimientos distintos", async () => {
      const primera = await ledger.post(transferencia(5_000n));
      const segunda = await ledger.post(transferencia(5_000n));

      expect(segunda.id).not.toBe(primera.id);
      expect(await ledger.balanceOf(destino)).toBe(10_000n);
    });
  });

  describe("balanceOf", () => {
    it("deriva el saldo sumando los asientos", async () => {
      await ledger.post(transferencia(5_000n));
      await ledger.post(transferencia(2_500n));

      expect(await ledger.balanceOf(origen)).toBe(-7_500n);
      expect(await ledger.balanceOf(destino)).toBe(7_500n);
    });

    it("una cuenta sin movimientos vale cero", async () => {
      expect(await ledger.balanceOf(origen)).toBe(0n);
    });

    it("una cuenta que no existe es un error, no un cero", async () => {
      // Devolver cero sería indistinguible de una cuenta recién abierta.
      await expect(ledger.balanceOf(randomUUID())).rejects.toThrow(UnknownAccountError);
      await expect(ledger.balanceOf("no-soy-un-uuid")).rejects.toThrow(UnknownAccountError);
    });

    it("aguanta importes que se salen de un entero de JavaScript", async () => {
      // 2^53 centavos. Con `number` esto perdería precisión en silencio.
      const enorme = 9_007_199_254_740_993n;

      await ledger.post({
        description: "Un importe absurdo, a propósito",
        entries: [
          { accountId: origen, amount: -enorme },
          { accountId: destino, amount: enorme },
        ],
      });

      expect(await ledger.balanceOf(destino)).toBe(enorme);
    });
  });

  describe("reverse", () => {
    it("deja el saldo como estaba", async () => {
      const movimiento = await ledger.post(transferencia(5_000n));
      expect(await ledger.balanceOf(destino)).toBe(5_000n);

      await ledger.reverse(movimiento.id);

      expect(await ledger.balanceOf(destino)).toBe(0n);
      expect(await ledger.balanceOf(origen)).toBe(0n);
    });

    it("no borra nada: deja el error escrito y su contrario al lado", async () => {
      const movimiento = await ledger.post(transferencia(5_000n));
      const anulacion = await ledger.reverse(movimiento.id);

      expect(anulacion.reversesId).toBe(movimiento.id);
      expect(anulacion.entries.map((asiento) => asiento.amount)).toEqual([-5_000n, 5_000n]);

      // Las dos transacciones siguen ahí, con sus cuatro asientos.
      expect(await prisma.transaction.count()).toBe(2);
      expect(await prisma.entry.count()).toBe(4);
    });

    it("hereda la descripción cuando no se le da una", async () => {
      const movimiento = await ledger.post(transferencia(5_000n));
      const anulacion = await ledger.reverse(movimiento.id);

      expect(anulacion.description).toContain(movimiento.description);
    });

    it("no se puede anular dos veces", async () => {
      const movimiento = await ledger.post(transferencia(5_000n));
      await ledger.reverse(movimiento.id);

      await expect(ledger.reverse(movimiento.id)).rejects.toThrow(AlreadyReversedError);
      expect(await prisma.transaction.count()).toBe(2);
    });

    it("sí se puede anular la anulación", async () => {
      const movimiento = await ledger.post(transferencia(5_000n));
      const anulacion = await ledger.reverse(movimiento.id);

      await ledger.reverse(anulacion.id);

      // Vuelta al punto de partida, con las tres transacciones en el histórico.
      expect(await ledger.balanceOf(destino)).toBe(5_000n);
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
      await prisma.$transaction((tx) => ledger.postWithin(tx, transferencia(5_000n)));

      expect(await ledger.balanceOf(destino)).toBe(5_000n);
    });

    it("permite dos movimientos en la misma transacción", async () => {
      // `SET CONSTRAINTS ALL IMMEDIATE` dura hasta el final de la transacción.
      // Si no se devolviera a diferido, el segundo movimiento fallaría al
      // insertar su primer asiento, cuando la suma todavía no es cero.
      await prisma.$transaction(async (tx) => {
        await ledger.postWithin(tx, transferencia(5_000n));
        await ledger.postWithin(tx, transferencia(2_500n));
      });

      expect(await ledger.balanceOf(destino)).toBe(7_500n);
      expect(await prisma.transaction.count()).toBe(2);
    });

    it("si el segundo movimiento falla no queda ni el primero", async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          await ledger.postWithin(tx, transferencia(5_000n));
          await ledger.postWithin(tx, {
            description: "Descuadre",
            entries: [
              { accountId: origen, amount: -5_000n },
              { accountId: destino, amount: 3_000n },
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
      const movimiento = await ledger.post(transferencia(5_000n));
      const leida = await ledger.byId(movimiento.id);

      expect(leida?.id).toBe(movimiento.id);
      expect(leida?.entries).toHaveLength(2);
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
                  { accountId: origen, amount: -5_000n },
                  { accountId: destino, amount: 3_000n },
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
            entries: { createMany: { data: [{ accountId: origen, amount: -5_000n }] } },
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
      const fallo = await capturar(() =>
        prisma.transaction.create({
          data: {
            description: "Un cero por la puerta de atrás",
            entries: {
              createMany: {
                data: [
                  { accountId: origen, amount: 0n },
                  { accountId: destino, amount: 0n },
                ],
              },
            },
          },
        }),
      );

      expect(readPostgresFailure(fallo)?.code).toBe(PG_CHECK_VIOLATION);
      expect(await prisma.transaction.count()).toBe(0);
    });

    it("rechaza editar un asiento", async () => {
      const movimiento = await ledger.post(transferencia(5_000n));
      const asiento = primerAsiento(movimiento.entries);

      await expect(
        prisma.entry.update({ where: { id: asiento.id }, data: { amount: 1n } }),
      ).rejects.toThrow();

      // Sigue valiendo lo que valía.
      expect(await ledger.balanceOf(origen)).toBe(-5_000n);
    });

    it("rechaza borrar un asiento", async () => {
      const movimiento = await ledger.post(transferencia(5_000n));
      const asiento = primerAsiento(movimiento.entries);

      await expect(prisma.entry.delete({ where: { id: asiento.id } })).rejects.toThrow();

      expect(await prisma.entry.count()).toBe(2);
      expect(await ledger.balanceOf(origen)).toBe(-5_000n);
    });
  });
});

/** Devuelve el error en vez de dejarlo escapar, para poder inspeccionarlo. */
async function capturar(accion: () => Promise<unknown>): Promise<unknown> {
  try {
    await accion();
  } catch (error) {
    return error;
  }

  throw new Error("Se esperaba que fallara y no falló");
}

/** `noUncheckedIndexedAccess` obliga a comprobar; esto lo hace legible. */
function primerAsiento<T>(entries: T[]): T {
  const [primero] = entries;
  if (primero === undefined) throw new Error("La transacción debería tener asientos");

  return primero;
}
