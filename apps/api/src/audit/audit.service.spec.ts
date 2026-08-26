import type { TestingModule } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AccountsService } from "../accounts/accounts.service";
import { LedgerService } from "../ledger/ledger.service";
import { PrismaService } from "../prisma/prisma.service";
import { createOwner, createTestingModule, truncateAll } from "../test/database";
import { TransfersService } from "../transfers/transfers.service";
import { AuditService } from "./audit.service";
import type { AuditReport } from "./audit.types";

describe("AuditService", () => {
  let moduleRef: TestingModule;
  let audit: AuditService;
  let ledger: LedgerService;
  let transfers: TransfersService;
  let accounts: AccountsService;
  let prisma: PrismaService;

  let world: string;
  let ana: string;
  let luis: string;

  beforeAll(async () => {
    moduleRef = await createTestingModule();
    audit = moduleRef.get(AuditService);
    ledger = moduleRef.get(LedgerService);
    transfers = moduleRef.get(TransfersService);
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
    luis = (await accounts.open({ ownerId: await createOwner(prisma), name: "Luis" })).id;
  });

  const deposit = (cuenta: string, centavos: bigint) =>
    transfers.transfer({ fromAccountId: world, toAccountId: cuenta, amount: centavos });

  const findingFor = (report: AuditReport, check: string) =>
    report.findings.find((found) => found.check === check);

  describe("un libro sano", () => {
    it("recién creado está limpio", async () => {
      const report = await audit.run();

      expect(report.clean).toBe(true);
      expect(report.findings).toEqual([]);
      expect(report.totals.netAmount).toBe(0n);
    });

    it("sigue limpio después de ingresos, transferencias y una anulación", async () => {
      await deposit(ana, 10_000n);
      const posted = await transfers.transfer({
        fromAccountId: ana,
        toAccountId: luis,
        amount: 2_500n,
      });
      await ledger.reverse(posted.id);

      const report = await audit.run();

      expect(report.findings).toEqual([]);
      expect(report.clean).toBe(true);
    });

    it("cuenta lo que hay, y el neto del libro es cero", async () => {
      await deposit(ana, 10_000n);
      await transfers.transfer({ fromAccountId: ana, toAccountId: luis, amount: 2_500n });

      const { totals } = await audit.run();

      expect(totals.accounts).toBe(4); // world, ana, luis y el world de la migración
      expect(totals.transactions).toBe(2);
      expect(totals.entries).toBe(4);

      // La cifra que resume el libro entero: cada asiento negativo tiene su
      // contrapartida positiva, así que sumarlos todos da cero.
      expect(totals.netAmount).toBe(0n);
    });
  });

  /**
   * Los dos únicos controles que se pueden disparar sin tocar la base.
   *
   * No es casualidad: son exactamente los que **ninguna restricción protege**.
   * Los demás hacen falta igual, pero para verlos fallar hay que desmontar
   * primero la garantía que los cubre — que es lo del bloque siguiente.
   */
  describe("lo que ninguna restricción protege", () => {
    it("detecta una cuenta de persona en negativo", async () => {
      // `TransfersService` no lo permitiría, pero el motor de asientos no
      // comprueba saldos: registra lo que le digan. Un script de importación o
      // una llamada directa dejan la cuenta en descubierto sin que nada chille.
      await ledger.post({
        description: "Un cargo que nadie autorizó",
        entries: [
          { accountId: ana, amount: -5_000n },
          { accountId: world, amount: 5_000n },
        ],
      });

      const report = await audit.run();
      const found = findingFor(report, "overdrawn-user-accounts");

      expect(report.clean).toBe(false);
      expect(found?.severity).toBe("critical");
      expect(found?.count).toBe(1);
      expect(found?.sample[0]).toContain(ana);

      // Y sin embargo el libro entero sigue cuadrando: por eso hace falta este
      // control además del neto.
      expect(report.totals.netAmount).toBe(0n);
    });

    it("no se queja de que una cuenta de sistema esté en negativo", async () => {
      // Está en negativo por definición: es la medida de cuánto dinero ha
      // entrado al libro desde fuera.
      await deposit(ana, 10_000n);

      const report = await audit.run();

      expect(await ledger.balanceOf(world)).toBe(-10_000n);
      expect(findingFor(report, "overdrawn-user-accounts")).toBeUndefined();
    });

    it("detecta una anulación que no invierte nada", async () => {
      const original = await deposit(ana, 10_000n);

      // El índice único garantiza que sólo hay una anulación por transacción.
      // No garantiza que anule: esto está cuadrado y pasa todos los triggers.
      await prisma.$transaction(async (tx) => {
        await tx.transaction.create({
          data: {
            description: "Anulación de mentira",
            reversesId: original.id,
            entries: {
              createMany: {
                data: [
                  { accountId: ana, amount: -100n },
                  { accountId: world, amount: 100n },
                ],
              },
            },
          },
        });
        await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
      });

      const report = await audit.run();
      const found = findingFor(report, "reversals-that-do-not-reverse");

      expect(found?.severity).toBe("critical");
      expect(found?.count).toBe(1);
    });

    it("da por buena una anulación de verdad", async () => {
      const original = await deposit(ana, 10_000n);
      await ledger.reverse(original.id);

      expect(findingFor(await audit.run(), "reversals-that-do-not-reverse")).toBeUndefined();
    });

    it("avisa de una transacción que no mueve nada", async () => {
      // El trigger de cuadre es `AFTER INSERT ON entries`: sin asientos no
      // llega a dispararse, así que esto entra sin que nadie lo pare.
      await prisma.transaction.create({ data: { description: "Una transacción vacía" } });

      const report = await audit.run();
      const found = findingFor(report, "empty-transactions");

      // Aviso y no crítico: es suciedad, no dinero perdido.
      expect(found?.severity).toBe("warning");
      expect(report.clean).toBe(false);
    });
  });

  /**
   * Y tampoco se fía de las restricciones que sí existen.
   *
   * Comprobar que los asientos suman cero parece redundante habiendo un
   * trigger. Se comprueba igual porque un trigger se puede caer en una
   * migración mal escrita, o desactivarse para una carga masiva y no volver a
   * activarse. Aquí se reproduce ese escenario a propósito.
   */
  describe("y no se fía de las restricciones que sí existen", () => {
    it("ve el descuadre si el trigger deja de estar", async () => {
      await withoutTrigger(prisma, "entries_must_balance", async () => {
        await prisma.transaction.create({
          data: {
            description: "Dinero de la nada",
            entries: {
              createMany: {
                data: [
                  { accountId: ana, amount: -5_000n },
                  { accountId: luis, amount: 3_000n },
                ],
              },
            },
          },
        });
      });

      const report = await audit.run();

      expect(findingFor(report, "unbalanced-transactions")?.count).toBe(1);
      expect(findingFor(report, "ledger-unbalanced")?.severity).toBe("critical");
      expect(report.totals.netAmount).toBe(-2_000n);
    });

    it("ve la media partida si el trigger deja de estar", async () => {
      await withoutTrigger(prisma, "entries_must_balance", async () => {
        await prisma.transaction.create({
          data: {
            description: "Media partida",
            entries: { createMany: { data: [{ accountId: ana, amount: -5_000n }] } },
          },
        });
      });

      expect(findingFor(await audit.run(), "single-entry-transactions")?.count).toBe(1);
    });

    it("ve el importe cero si el CHECK deja de estar", async () => {
      await withoutCheck(prisma, "entries_amount_not_zero", "amount <> 0", async () => {
        await prisma.$transaction(async (tx) => {
          await tx.transaction.create({
            data: {
              description: "Un movimiento que no mueve nada",
              entries: {
                createMany: {
                  data: [
                    { accountId: ana, amount: 0n },
                    { accountId: luis, amount: 0n },
                  ],
                },
              },
            },
          });
          await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
        });
      });

      expect(findingFor(await audit.run(), "zero-amount-entries")?.count).toBe(2);
    });
  });
});

/**
 * Corre algo con un trigger desactivado, y lo vuelve a activar pase lo que pase.
 *
 * El `finally` no es cortesía: sin él, un fallo aquí dejaría la base sin su
 * garantía para todos los tests que vengan detrás, y empezarían a pasar cosas
 * inexplicables lejos de la causa.
 */
async function withoutTrigger(
  prisma: PrismaService,
  trigger: string,
  action: () => Promise<void>,
): Promise<void> {
  await prisma.$executeRawUnsafe(`ALTER TABLE "entries" DISABLE TRIGGER "${trigger}"`);

  try {
    await action();
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "entries" ENABLE TRIGGER "${trigger}"`);
  }
}

/**
 * Igual, pero con una restricción CHECK.
 *
 * Se vuelve a poner con `NOT VALID` porque las filas que la incumplen siguen
 * en la tabla cuando toca restaurarla, y no se pueden borrar — el trigger de
 * inmutabilidad lo impide. `NOT VALID` no revisa lo que ya hay pero sí exige
 * la regla a todo lo que entre después, que es lo que necesitan los tests
 * siguientes. El `beforeEach` se lleva las filas malas con un TRUNCATE.
 */
async function withoutCheck(
  prisma: PrismaService,
  constraint: string,
  definition: string,
  action: () => Promise<void>,
): Promise<void> {
  await prisma.$executeRawUnsafe(`ALTER TABLE "entries" DROP CONSTRAINT "${constraint}"`);

  try {
    await action();
  } finally {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "entries" ADD CONSTRAINT "${constraint}" CHECK (${definition}) NOT VALID`,
    );
  }
}
