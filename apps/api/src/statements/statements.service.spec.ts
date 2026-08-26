import { randomUUID } from "node:crypto";

import type { TestingModule } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AccountsService } from "../accounts/accounts.service";
import { UnknownAccountError } from "../ledger/ledger.errors";
import { LedgerService } from "../ledger/ledger.service";
import { PrismaService } from "../prisma/prisma.service";
import { createOwner, createTestingModule, truncateAll } from "../test/database";
import { InvalidCursorError, InvalidPageSizeError } from "./statements.errors";
import { StatementsService } from "./statements.service";
import type { StatementLine } from "./statements.types";

describe("StatementsService", () => {
  let moduleRef: TestingModule;
  let statements: StatementsService;
  let ledger: LedgerService;
  let accounts: AccountsService;
  let prisma: PrismaService;

  let world: string;
  let ana: string;

  beforeAll(async () => {
    moduleRef = await createTestingModule();
    statements = moduleRef.get(StatementsService);
    ledger = moduleRef.get(LedgerService);
    accounts = moduleRef.get(AccountsService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);

    world = (
      await accounts.open({ ownerId: await createOwner(prisma), name: "Mundo", kind: "SYSTEM" })
    ).id;
    ana = (await accounts.open({ ownerId: await createOwner(prisma), name: "Ana" })).id;
  });

  const deposit = (cents: bigint, description = `Ingreso de ${cents}`) =>
    ledger.post({
      description,
      entries: [
        { accountId: world, amount: -cents },
        { accountId: ana, amount: cents },
      ],
    });

  /** Recorre el extracto entero pasando de página, como haría un cliente. */
  const readAll = async (accountId: string, limit: number): Promise<StatementLine[]> => {
    const all: StatementLine[] = [];
    let cursor: string | undefined;
    let rounds = 0;

    do {
      const page = await statements.statement(accountId, { cursor, limit });
      all.push(...page.lines);
      cursor = page.nextCursor ?? undefined;

      if (++rounds > 100) throw new Error("El cursor no avanza: paginación en bucle");
    } while (cursor !== undefined);

    return all;
  };

  describe("statement", () => {
    it("una cuenta sin movimientos da un extracto vacío", async () => {
      const page = await statements.statement(ana);

      expect(page.lines).toEqual([]);
      expect(page.nextCursor).toBeNull();
    });

    it("la primera línea muestra el saldo actual", async () => {
      await deposit(5_000n);
      await deposit(3_000n);

      const page = await statements.statement(ana);

      expect(page.lines[0]?.balance).toBe(8_000n);
      expect(page.lines[0]?.balance).toBe(await ledger.balanceOf(ana));
    });

    it("va del movimiento más reciente al más antiguo", async () => {
      await deposit(5_000n, "El primero");
      await waitATick();
      await deposit(3_000n, "El segundo");

      const page = await statements.statement(ana);

      expect(page.lines.map((line) => line.description)).toEqual(["El segundo", "El primero"]);
    });

    it("el saldo corriente baja línea a línea", async () => {
      await deposit(5_000n);
      await waitATick();
      await deposit(3_000n);
      await waitATick();
      await deposit(2_000n);

      const page = await statements.statement(ana);

      // Leído de arriba abajo es la historia hacia atrás: 10.000, 8.000, 5.000.
      expect(page.lines.map((line) => line.balance)).toEqual([10_000n, 8_000n, 5_000n]);
    });

    it("la última línea del extracto es el primer movimiento", async () => {
      await deposit(5_000n, "El primero");
      await waitATick();
      await deposit(3_000n);

      const all = await readAll(ana, 1);
      const last = all[all.length - 1];

      expect(last?.description).toBe("El primero");
      expect(last?.balance).toBe(5_000n);
    });

    it("recorrer todas las páginas devuelve cada asiento una sola vez", async () => {
      for (let i = 1; i <= 12; i++) {
        await deposit(BigInt(i) * 100n);
      }

      const all = await readAll(ana, 5);

      expect(all).toHaveLength(12);
      expect(new Set(all.map((line) => line.entryId)).size).toBe(12);
    });

    /**
     * El caso que justifica el cursor compuesto.
     *
     * Con un cursor de sólo fecha, los asientos empatados se pierden o se
     * repiten al pasar de página. En un extracto bancario eso es un movimiento
     * que desaparece ante los ojos de quien lo lee.
     */
    it("no se salta asientos que comparten fecha al milisegundo", async () => {
      // Los tres asientos van en la misma transacción, y en Postgres `now()`
      // devuelve la hora de inicio de la transacción: los dos de Ana llevan
      // exactamente el mismo `created_at`.
      await ledger.post({
        description: "Nómina con dos partidas",
        entries: [
          { accountId: world, amount: -30_000n },
          { accountId: ana, amount: 20_000n },
          { accountId: ana, amount: 10_000n },
        ],
      });

      const all = await readAll(ana, 1);
      const [first, second] = all;
      if (!first || !second) throw new Error("El extracto debería traer los dos asientos");

      // La premisa del test: si el empate no se diera, no probaría nada.
      expect(all).toHaveLength(2);
      expect(first.createdAt.getTime()).toBe(second.createdAt.getTime());

      expect(new Set(all.map((line) => line.amount))).toEqual(new Set([20_000n, 10_000n]));
      expect(first.balance).toBe(30_000n);
      expect(second.balance).toBe(first.balance - first.amount);
    });

    it("la última página no trae cursor", async () => {
      await deposit(5_000n);

      const page = await statements.statement(ana, { limit: 10 });

      expect(page.lines).toHaveLength(1);
      expect(page.nextCursor).toBeNull();
    });

    it("hay cursor mientras quede algo por leer", async () => {
      await deposit(5_000n);
      await deposit(3_000n);

      const page = await statements.statement(ana, { limit: 1 });

      expect(page.lines).toHaveLength(1);
      expect(page.nextCursor).not.toBeNull();
    });

    it("recorta un tamaño de página demasiado grande", async () => {
      await deposit(5_000n);

      // Pedir mil es decir «dame todo lo que puedas»; devolver cien responde a
      // esa intención sin fallar.
      await expect(statements.statement(ana, { limit: 1_000 })).resolves.toBeDefined();
    });

    it("rechaza un tamaño de página imposible", async () => {
      // Cero o media línea no es una intención, es un fallo de quien llama.
      await expect(statements.statement(ana, { limit: 0 })).rejects.toThrow(
        InvalidPageSizeError,
      );
      await expect(statements.statement(ana, { limit: -5 })).rejects.toThrow(
        InvalidPageSizeError,
      );
      await expect(statements.statement(ana, { limit: 2.5 })).rejects.toThrow(
        InvalidPageSizeError,
      );
    });

    it("rechaza un cursor que no es de los nuestros", async () => {
      await expect(statements.statement(ana, { cursor: "basura" })).rejects.toThrow(
        InvalidCursorError,
      );
    });

    it("rechaza una cuenta que no existe", async () => {
      await expect(statements.statement(randomUUID())).rejects.toThrow(UnknownAccountError);
      await expect(statements.statement("no-soy-un-uuid")).rejects.toThrow(UnknownAccountError);
    });

    it("marca las líneas que corrigen a otro movimiento", async () => {
      const posted = await deposit(5_000n);
      await waitATick();
      await ledger.reverse(posted.id);

      const page = await statements.statement(ana);

      expect(page.lines.map((line) => line.isReversal)).toEqual([true, false]);
      expect(page.lines[0]?.balance).toBe(0n);
    });
  });

  describe("balanceAt", () => {
    it("ignora lo que vino después de la fecha", async () => {
      await deposit(5_000n);
      const before = await lastEntryDate();
      await waitATick();
      await deposit(3_000n);

      expect(await statements.balanceAt(ana, before)).toBe(5_000n);
      expect(await statements.balanceAt(ana, new Date())).toBe(8_000n);
    });

    it("antes del primer movimiento la cuenta estaba a cero", async () => {
      await deposit(5_000n);

      expect(await statements.balanceAt(ana, new Date("2020-01-01"))).toBe(0n);
    });

    it("una cuenta sin movimientos vale cero en cualquier fecha", async () => {
      expect(await statements.balanceAt(ana, new Date())).toBe(0n);
    });

    it("rechaza una cuenta que no existe", async () => {
      await expect(statements.balanceAt(randomUUID(), new Date())).rejects.toThrow(
        UnknownAccountError,
      );
    });
  });

  /** La fecha del asiento más reciente de Ana, leída de la propia base. */
  const lastEntryDate = async (): Promise<Date> => {
    const page = await statements.statement(ana, { limit: 1 });
    const line = page.lines[0];
    if (!line) throw new Error("No hay movimientos de los que leer la fecha");

    return line.createdAt;
  };
});

/**
 * Separa dos movimientos en el reloj.
 *
 * `created_at` es `TIMESTAMP(3)`, la misma precisión que `Date`. Dos escrituras
 * en el mismo milisegundo empatarían, y los tests que preguntan «¿qué había
 * antes de esta fecha?» dejarían de significar nada.
 */
function waitATick(): Promise<void> {
  return new Promise((done) => setTimeout(done, 5));
}
