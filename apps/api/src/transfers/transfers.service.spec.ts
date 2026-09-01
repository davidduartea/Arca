import { randomUUID } from "node:crypto";

import type { TestingModule } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AccountsService } from "../accounts/accounts.service";
import { IdempotencyKeyReusedError, UnknownAccountError } from "../ledger/ledger.errors";
import { LedgerService } from "../ledger/ledger.service";
import { PrismaService } from "../prisma/prisma.service";
import { createOwner, createTestingModule, truncateAll } from "../test/database";
import {
  InsufficientFundsError,
  NonPositiveAmountError,
  SameAccountTransferError,
} from "./transfers.errors";
import { TransfersService } from "./transfers.service";

describe("TransfersService", () => {
  let moduleRef: TestingModule;
  let transfers: TransfersService;
  let ledger: LedgerService;
  let accounts: AccountsService;
  let prisma: PrismaService;

  /** El mundo exterior: de aquí sale el dinero que entra al libro. */
  let world: string;
  let ana: string;
  let luis: string;

  beforeAll(async () => {
    moduleRef = await createTestingModule();
    transfers = moduleRef.get(TransfersService);
    ledger = moduleRef.get(LedgerService);
    accounts = moduleRef.get(AccountsService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await truncateAll();

    const bank = await createOwner(prisma);
    world = (await accounts.open({ ownerId: bank, name: "Mundo exterior", kind: "SYSTEM" })).id;
    ana = (await accounts.open({ ownerId: await createOwner(prisma), name: "Ana" })).id;
    luis = (await accounts.open({ ownerId: await createOwner(prisma), name: "Luis" })).id;
  });

  /** Un ingreso es una transferencia desde el mundo exterior. */
  const deposit = (account: string, cents: bigint) =>
    transfers.transfer({ fromAccountId: world, toAccountId: account, amount: cents });

  describe("transfer", () => {
    it("mueve el dinero de una cuenta a otra", async () => {
      await deposit(ana, 10_000n);

      await transfers.transfer({ fromAccountId: ana, toAccountId: luis, amount: 2_500n });

      expect(await ledger.balanceOf(ana)).toBe(7_500n);
      expect(await ledger.balanceOf(luis)).toBe(2_500n);
    });

    it("un ingreso deja la cuenta de sistema en negativo, y está bien", async () => {
      await deposit(ana, 10_000n);

      // No es un descubierto: es el contrapunto contable de que ese dinero
      // entró al libro desde fuera. Sin él la transacción no sumaría cero.
      expect(await ledger.balanceOf(world)).toBe(-10_000n);
    });

    it("no deja a una cuenta de persona en descubierto", async () => {
      await deposit(ana, 10_000n);

      await expect(
        transfers.transfer({ fromAccountId: ana, toAccountId: luis, amount: 10_001n }),
      ).rejects.toThrow(InsufficientFundsError);
    });

    it("deja gastar hasta el último centavo, pero ni uno más", async () => {
      await deposit(ana, 10_000n);

      await transfers.transfer({ fromAccountId: ana, toAccountId: luis, amount: 10_000n });
      expect(await ledger.balanceOf(ana)).toBe(0n);

      await expect(
        transfers.transfer({ fromAccountId: ana, toAccountId: luis, amount: 1n }),
      ).rejects.toThrow(InsufficientFundsError);
    });

    it("no deja nada escrito cuando no hay fondos", async () => {
      const transactionCount = await prisma.transaction.count();

      await expect(
        transfers.transfer({ fromAccountId: ana, toAccountId: luis, amount: 100n }),
      ).rejects.toThrow(InsufficientFundsError);

      expect(await prisma.transaction.count()).toBe(transactionCount);
      expect(await prisma.entry.count()).toBe(0);
    });

    it("rechaza importes que no son positivos", async () => {
      await deposit(ana, 10_000n);

      // Un importe negativo sería una transferencia al revés disfrazada, y
      // esquivaría la comprobación de fondos de quien la recibe.
      await expect(
        transfers.transfer({ fromAccountId: ana, toAccountId: luis, amount: -100n }),
      ).rejects.toThrow(NonPositiveAmountError);

      await expect(
        transfers.transfer({ fromAccountId: ana, toAccountId: luis, amount: 0n }),
      ).rejects.toThrow(NonPositiveAmountError);
    });

    it("rechaza mover dinero de una cuenta a sí misma", async () => {
      await expect(
        transfers.transfer({ fromAccountId: ana, toAccountId: ana, amount: 100n }),
      ).rejects.toThrow(SameAccountTransferError);
    });

    it("rechaza cuentas que no existen", async () => {
      await deposit(ana, 10_000n);

      await expect(
        transfers.transfer({ fromAccountId: ana, toAccountId: randomUUID(), amount: 100n }),
      ).rejects.toThrow(UnknownAccountError);

      await expect(
        transfers.transfer({ fromAccountId: randomUUID(), toAccountId: ana, amount: 100n }),
      ).rejects.toThrow(UnknownAccountError);
    });

    it("describe el movimiento con el importe en dólares", async () => {
      await deposit(ana, 10_000n);

      const posted = await transfers.transfer({
        fromAccountId: ana,
        toAccountId: luis,
        amount: 2_550n,
      });

      expect(posted.description).toBe("Transferencia de $25.50");
    });

    it("acepta una descripción propia", async () => {
      await deposit(ana, 10_000n);

      const posted = await transfers.transfer({
        fromAccountId: ana,
        toAccountId: luis,
        amount: 100n,
        description: "Cena del viernes",
      });

      expect(posted.description).toBe("Cena del viernes");
    });
  });

  describe("idempotencia", () => {
    it("reintentar con la misma clave no cobra dos veces", async () => {
      await deposit(ana, 10_000n);
      const order = {
        fromAccountId: ana,
        toAccountId: luis,
        amount: 2_500n,
        idempotencyKey: randomUUID(),
      };

      const first = await transfers.transfer(order);
      const retry = await transfers.transfer(order);

      expect(retry.id).toBe(first.id);
      expect(await ledger.balanceOf(ana)).toBe(7_500n);
    });

    it("dos reintentos a la vez con la misma clave sólo cobran uno", async () => {
      await deposit(ana, 10_000n);
      const order = {
        fromAccountId: ana,
        toAccountId: luis,
        amount: 2_500n,
        idempotencyKey: randomUUID(),
      };

      // Las dos pasan el camino rápido sin encontrar nada; una choca contra el
      // índice único y se recupera releyendo fuera de su transacción.
      const [first, second] = await Promise.all([
        transfers.transfer(order),
        transfers.transfer(order),
      ]);

      expect(first.id).toBe(second.id);
      expect(await ledger.balanceOf(ana)).toBe(7_500n);
    });

    it("la misma clave con otro importe es un error", async () => {
      await deposit(ana, 10_000n);
      const key = randomUUID();

      await transfers.transfer({
        fromAccountId: ana,
        toAccountId: luis,
        amount: 2_500n,
        idempotencyKey: key,
      });

      await expect(
        transfers.transfer({
          fromAccountId: ana,
          toAccountId: luis,
          amount: 9_999n,
          idempotencyKey: key,
        }),
      ).rejects.toThrow(IdempotencyKeyReusedError);

      expect(await ledger.balanceOf(ana)).toBe(7_500n);
    });
  });

  /**
   * Lo que separa este proyecto de un CRUD.
   *
   * Todo lo de arriba pasaría igual con un `if (saldo < importe)` a pelo. Estos
   * tres no.
   */
  describe("concurrencia", () => {
    it("cincuenta transferencias a la vez sobre $100: pasan exactamente diez", async () => {
      await deposit(ana, 10_000n);

      const attempts = Array.from({ length: 50 }, () =>
        transfers
          .transfer({ fromAccountId: ana, toAccountId: luis, amount: 1_000n })
          .then(() => "charged" as const)
          .catch((error: unknown) => {
            if (error instanceof InsufficientFundsError) return "insufficient" as const;
            throw error;
          }),
      );

      const outcomes = await Promise.all(attempts);

      expect(outcomes.filter((r) => r === "charged")).toHaveLength(10);
      expect(outcomes.filter((r) => r === "insufficient")).toHaveLength(40);

      // Y lo que de verdad importa: la cuenta acaba en cero y nunca pasó por
      // debajo. Sin el bloqueo pasarían las cincuenta y quedaría en -$400.
      expect(await ledger.balanceOf(ana)).toBe(0n);
      expect(await ledger.balanceOf(luis)).toBe(10_000n);
    });

    it("transferencias cruzadas a la vez no se interbloquean", async () => {
      await deposit(ana, 10_000n);
      await deposit(luis, 10_000n);

      // Diez de ida y diez de vuelta, a la vez. Sin ordenar los bloqueos, cada
      // sentido coge primero la llave que el otro necesita: Postgres detecta el
      // interbloqueo y mata a una de las dos, así que el síntoma no sería un
      // cuelgue sino un fallo intermitente e inexplicable.
      const outbound = Array.from({ length: 10 }, () =>
        transfers.transfer({ fromAccountId: ana, toAccountId: luis, amount: 100n }),
      );
      const inbound = Array.from({ length: 10 }, () =>
        transfers.transfer({ fromAccountId: luis, toAccountId: ana, amount: 100n }),
      );

      await Promise.all([...outbound, ...inbound]);

      expect(await ledger.balanceOf(ana)).toBe(10_000n);
      expect(await ledger.balanceOf(luis)).toBe(10_000n);
    });

    it("veinte ingresos a la vez no se pierde ninguno", async () => {
      // El otro lado del bloqueo: aquí ninguna debe fallar, y ninguna debe
      // perderse por leer un saldo que otra estaba a punto de cambiar.
      await Promise.all(Array.from({ length: 20 }, () => deposit(ana, 500n)));

      expect(await ledger.balanceOf(ana)).toBe(10_000n);
      expect(await ledger.balanceOf(world)).toBe(-10_000n);
      expect(await prisma.transaction.count()).toBe(20);
    });
  });
});
