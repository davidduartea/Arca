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
  let modulo: TestingModule;
  let statements: StatementsService;
  let ledger: LedgerService;
  let accounts: AccountsService;
  let prisma: PrismaService;

  let mundo: string;
  let ana: string;

  beforeAll(async () => {
    modulo = await createTestingModule();
    statements = modulo.get(StatementsService);
    ledger = modulo.get(LedgerService);
    accounts = modulo.get(AccountsService);
    prisma = modulo.get(PrismaService);
  });

  afterAll(async () => {
    await modulo.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);

    mundo = (
      await accounts.open({ ownerId: await createOwner(prisma), name: "Mundo", kind: "SYSTEM" })
    ).id;
    ana = (await accounts.open({ ownerId: await createOwner(prisma), name: "Ana" })).id;
  });

  const ingresar = (centavos: bigint, description = `Ingreso de ${centavos}`) =>
    ledger.post({
      description,
      entries: [
        { accountId: mundo, amount: -centavos },
        { accountId: ana, amount: centavos },
      ],
    });

  /** Recorre el extracto entero pasando de página, como haría un cliente. */
  const recorrerTodo = async (accountId: string, limit: number): Promise<StatementLine[]> => {
    const todas: StatementLine[] = [];
    let cursor: string | undefined;
    let vueltas = 0;

    do {
      const pagina = await statements.statement(accountId, { cursor, limit });
      todas.push(...pagina.lines);
      cursor = pagina.nextCursor ?? undefined;

      if (++vueltas > 100) throw new Error("El cursor no avanza: paginación en bucle");
    } while (cursor !== undefined);

    return todas;
  };

  describe("statement", () => {
    it("una cuenta sin movimientos da un extracto vacío", async () => {
      const pagina = await statements.statement(ana);

      expect(pagina.lines).toEqual([]);
      expect(pagina.nextCursor).toBeNull();
    });

    it("la primera línea muestra el saldo actual", async () => {
      await ingresar(5_000n);
      await ingresar(3_000n);

      const pagina = await statements.statement(ana);

      expect(pagina.lines[0]?.balance).toBe(8_000n);
      expect(pagina.lines[0]?.balance).toBe(await ledger.balanceOf(ana));
    });

    it("va del movimiento más reciente al más antiguo", async () => {
      await ingresar(5_000n, "El primero");
      await esperarUnLatido();
      await ingresar(3_000n, "El segundo");

      const pagina = await statements.statement(ana);

      expect(pagina.lines.map((linea) => linea.description)).toEqual([
        "El segundo",
        "El primero",
      ]);
    });

    it("el saldo corriente baja línea a línea", async () => {
      await ingresar(5_000n);
      await esperarUnLatido();
      await ingresar(3_000n);
      await esperarUnLatido();
      await ingresar(2_000n);

      const pagina = await statements.statement(ana);

      // Leído de arriba abajo es la historia hacia atrás: 10.000, 8.000, 5.000.
      expect(pagina.lines.map((linea) => linea.balance)).toEqual([10_000n, 8_000n, 5_000n]);
    });

    it("la última línea del extracto es el primer movimiento", async () => {
      await ingresar(5_000n, "El primero");
      await esperarUnLatido();
      await ingresar(3_000n);

      const todas = await recorrerTodo(ana, 1);
      const ultima = todas[todas.length - 1];

      expect(ultima?.description).toBe("El primero");
      expect(ultima?.balance).toBe(5_000n);
    });

    it("recorrer todas las páginas devuelve cada asiento una sola vez", async () => {
      for (let i = 1; i <= 12; i++) {
        await ingresar(BigInt(i) * 100n);
      }

      const todas = await recorrerTodo(ana, 5);

      expect(todas).toHaveLength(12);
      expect(new Set(todas.map((linea) => linea.entryId)).size).toBe(12);
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
          { accountId: mundo, amount: -30_000n },
          { accountId: ana, amount: 20_000n },
          { accountId: ana, amount: 10_000n },
        ],
      });

      const todas = await recorrerTodo(ana, 1);
      const [primera, segunda] = todas;
      if (!primera || !segunda) throw new Error("El extracto debería traer los dos asientos");

      // La premisa del test: si el empate no se diera, no probaría nada.
      expect(todas).toHaveLength(2);
      expect(primera.createdAt.getTime()).toBe(segunda.createdAt.getTime());

      expect(new Set(todas.map((linea) => linea.amount))).toEqual(new Set([20_000n, 10_000n]));
      expect(primera.balance).toBe(30_000n);
      expect(segunda.balance).toBe(primera.balance - primera.amount);
    });

    it("la última página no trae cursor", async () => {
      await ingresar(5_000n);

      const pagina = await statements.statement(ana, { limit: 10 });

      expect(pagina.lines).toHaveLength(1);
      expect(pagina.nextCursor).toBeNull();
    });

    it("hay cursor mientras quede algo por leer", async () => {
      await ingresar(5_000n);
      await ingresar(3_000n);

      const pagina = await statements.statement(ana, { limit: 1 });

      expect(pagina.lines).toHaveLength(1);
      expect(pagina.nextCursor).not.toBeNull();
    });

    it("recorta un tamaño de página demasiado grande", async () => {
      await ingresar(5_000n);

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
      const movimiento = await ingresar(5_000n);
      await esperarUnLatido();
      await ledger.reverse(movimiento.id);

      const pagina = await statements.statement(ana);

      expect(pagina.lines.map((linea) => linea.isReversal)).toEqual([true, false]);
      expect(pagina.lines[0]?.balance).toBe(0n);
    });
  });

  describe("balanceAt", () => {
    it("ignora lo que vino después de la fecha", async () => {
      await ingresar(5_000n);
      const antes = await ultimaFecha();
      await esperarUnLatido();
      await ingresar(3_000n);

      expect(await statements.balanceAt(ana, antes)).toBe(5_000n);
      expect(await statements.balanceAt(ana, new Date())).toBe(8_000n);
    });

    it("antes del primer movimiento la cuenta estaba a cero", async () => {
      await ingresar(5_000n);

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
  const ultimaFecha = async (): Promise<Date> => {
    const pagina = await statements.statement(ana, { limit: 1 });
    const linea = pagina.lines[0];
    if (!linea) throw new Error("No hay movimientos de los que leer la fecha");

    return linea.createdAt;
  };
});

/**
 * Separa dos movimientos en el reloj.
 *
 * `created_at` es `TIMESTAMP(3)`, la misma precisión que `Date`. Dos escrituras
 * en el mismo milisegundo empatarían, y los tests que preguntan «¿qué había
 * antes de esta fecha?» dejarían de significar nada.
 */
function esperarUnLatido(): Promise<void> {
  return new Promise((listo) => setTimeout(listo, 5));
}
