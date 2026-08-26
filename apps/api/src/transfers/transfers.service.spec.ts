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
  let modulo: TestingModule;
  let transfers: TransfersService;
  let ledger: LedgerService;
  let accounts: AccountsService;
  let prisma: PrismaService;

  /** El mundo exterior: de aquí sale el dinero que entra al libro. */
  let mundo: string;
  let ana: string;
  let luis: string;

  beforeAll(async () => {
    modulo = await createTestingModule();
    transfers = modulo.get(TransfersService);
    ledger = modulo.get(LedgerService);
    accounts = modulo.get(AccountsService);
    prisma = modulo.get(PrismaService);
  });

  afterAll(async () => {
    await modulo.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);

    const banco = await createOwner(prisma);
    mundo = (await accounts.open({ ownerId: banco, name: "Mundo exterior", kind: "SYSTEM" }))
      .id;
    ana = (await accounts.open({ ownerId: await createOwner(prisma), name: "Ana" })).id;
    luis = (await accounts.open({ ownerId: await createOwner(prisma), name: "Luis" })).id;
  });

  /** Un ingreso es una transferencia desde el mundo exterior. */
  const ingresar = (cuenta: string, centavos: bigint) =>
    transfers.transfer({ fromAccountId: mundo, toAccountId: cuenta, amount: centavos });

  describe("transfer", () => {
    it("mueve el dinero de una cuenta a otra", async () => {
      await ingresar(ana, 10_000n);

      await transfers.transfer({ fromAccountId: ana, toAccountId: luis, amount: 2_500n });

      expect(await ledger.balanceOf(ana)).toBe(7_500n);
      expect(await ledger.balanceOf(luis)).toBe(2_500n);
    });

    it("un ingreso deja la cuenta de sistema en negativo, y está bien", async () => {
      await ingresar(ana, 10_000n);

      // No es un descubierto: es el contrapunto contable de que ese dinero
      // entró al libro desde fuera. Sin él la transacción no sumaría cero.
      expect(await ledger.balanceOf(mundo)).toBe(-10_000n);
    });

    it("no deja a una cuenta de persona en descubierto", async () => {
      await ingresar(ana, 10_000n);

      await expect(
        transfers.transfer({ fromAccountId: ana, toAccountId: luis, amount: 10_001n }),
      ).rejects.toThrow(InsufficientFundsError);
    });

    it("deja gastar hasta el último centavo, pero ni uno más", async () => {
      await ingresar(ana, 10_000n);

      await transfers.transfer({ fromAccountId: ana, toAccountId: luis, amount: 10_000n });
      expect(await ledger.balanceOf(ana)).toBe(0n);

      await expect(
        transfers.transfer({ fromAccountId: ana, toAccountId: luis, amount: 1n }),
      ).rejects.toThrow(InsufficientFundsError);
    });

    it("no deja nada escrito cuando no hay fondos", async () => {
      const movimientos = await prisma.transaction.count();

      await expect(
        transfers.transfer({ fromAccountId: ana, toAccountId: luis, amount: 100n }),
      ).rejects.toThrow(InsufficientFundsError);

      expect(await prisma.transaction.count()).toBe(movimientos);
      expect(await prisma.entry.count()).toBe(0);
    });

    it("rechaza importes que no son positivos", async () => {
      await ingresar(ana, 10_000n);

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
      await ingresar(ana, 10_000n);

      await expect(
        transfers.transfer({ fromAccountId: ana, toAccountId: randomUUID(), amount: 100n }),
      ).rejects.toThrow(UnknownAccountError);

      await expect(
        transfers.transfer({ fromAccountId: randomUUID(), toAccountId: ana, amount: 100n }),
      ).rejects.toThrow(UnknownAccountError);
    });

    it("describe el movimiento con el importe en dólares", async () => {
      await ingresar(ana, 10_000n);

      const movimiento = await transfers.transfer({
        fromAccountId: ana,
        toAccountId: luis,
        amount: 2_550n,
      });

      expect(movimiento.description).toBe("Transferencia de $25.50");
    });

    it("acepta una descripción propia", async () => {
      await ingresar(ana, 10_000n);

      const movimiento = await transfers.transfer({
        fromAccountId: ana,
        toAccountId: luis,
        amount: 100n,
        description: "Cena del viernes",
      });

      expect(movimiento.description).toBe("Cena del viernes");
    });
  });

  describe("idempotencia", () => {
    it("reintentar con la misma clave no cobra dos veces", async () => {
      await ingresar(ana, 10_000n);
      const orden = {
        fromAccountId: ana,
        toAccountId: luis,
        amount: 2_500n,
        idempotencyKey: randomUUID(),
      };

      const primera = await transfers.transfer(orden);
      const reintento = await transfers.transfer(orden);

      expect(reintento.id).toBe(primera.id);
      expect(await ledger.balanceOf(ana)).toBe(7_500n);
    });

    it("dos reintentos a la vez con la misma clave sólo cobran uno", async () => {
      await ingresar(ana, 10_000n);
      const orden = {
        fromAccountId: ana,
        toAccountId: luis,
        amount: 2_500n,
        idempotencyKey: randomUUID(),
      };

      // Las dos pasan el camino rápido sin encontrar nada; una choca contra el
      // índice único y se recupera releyendo fuera de su transacción.
      const [una, otra] = await Promise.all([
        transfers.transfer(orden),
        transfers.transfer(orden),
      ]);

      expect(una.id).toBe(otra.id);
      expect(await ledger.balanceOf(ana)).toBe(7_500n);
    });

    it("la misma clave con otro importe es un error", async () => {
      await ingresar(ana, 10_000n);
      const clave = randomUUID();

      await transfers.transfer({
        fromAccountId: ana,
        toAccountId: luis,
        amount: 2_500n,
        idempotencyKey: clave,
      });

      await expect(
        transfers.transfer({
          fromAccountId: ana,
          toAccountId: luis,
          amount: 9_999n,
          idempotencyKey: clave,
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
      await ingresar(ana, 10_000n);

      const intentos = Array.from({ length: 50 }, () =>
        transfers
          .transfer({ fromAccountId: ana, toAccountId: luis, amount: 1_000n })
          .then(() => "cobrada" as const)
          .catch((error: unknown) => {
            if (error instanceof InsufficientFundsError) return "sin fondos" as const;
            throw error;
          }),
      );

      const resultados = await Promise.all(intentos);

      expect(resultados.filter((r) => r === "cobrada")).toHaveLength(10);
      expect(resultados.filter((r) => r === "sin fondos")).toHaveLength(40);

      // Y lo que de verdad importa: la cuenta acaba en cero y nunca pasó por
      // debajo. Sin el bloqueo pasarían las cincuenta y quedaría en -$400.
      expect(await ledger.balanceOf(ana)).toBe(0n);
      expect(await ledger.balanceOf(luis)).toBe(10_000n);
    });

    it("transferencias cruzadas a la vez no se interbloquean", async () => {
      await ingresar(ana, 10_000n);
      await ingresar(luis, 10_000n);

      // Diez de ida y diez de vuelta, a la vez. Sin ordenar los bloqueos, cada
      // sentido coge primero la llave que el otro necesita: Postgres detecta el
      // interbloqueo y mata a una de las dos, así que el síntoma no sería un
      // cuelgue sino un fallo intermitente e inexplicable.
      const idas = Array.from({ length: 10 }, () =>
        transfers.transfer({ fromAccountId: ana, toAccountId: luis, amount: 100n }),
      );
      const vueltas = Array.from({ length: 10 }, () =>
        transfers.transfer({ fromAccountId: luis, toAccountId: ana, amount: 100n }),
      );

      await Promise.all([...idas, ...vueltas]);

      expect(await ledger.balanceOf(ana)).toBe(10_000n);
      expect(await ledger.balanceOf(luis)).toBe(10_000n);
    });

    it("veinte ingresos a la vez no se pierde ninguno", async () => {
      // El otro lado del bloqueo: aquí ninguna debe fallar, y ninguna debe
      // perderse por leer un saldo que otra estaba a punto de cambiar.
      await Promise.all(Array.from({ length: 20 }, () => ingresar(ana, 500n)));

      expect(await ledger.balanceOf(ana)).toBe(10_000n);
      expect(await ledger.balanceOf(mundo)).toBe(-10_000n);
      expect(await prisma.transaction.count()).toBe(20);
    });
  });
});
