import { Test } from "@nestjs/testing";
import type { TestingModule } from "@nestjs/testing";

import { AccountsModule } from "../accounts/accounts.module";
import { LedgerModule } from "../ledger/ledger.module";
import { DATABASE_URL, PrismaService } from "../prisma/prisma.service";
import { StatementsModule } from "../statements/statements.module";
import { TransfersModule } from "../transfers/transfers.module";
import { TEST_DATABASE_URL } from "./database-url";

/**
 * Levanta la aplicación apuntando a la base de pruebas.
 *
 * `init()` dispara `onModuleInit`, que es quien abre la conexión; sin eso el
 * primer test fallaría con el pool cerrado.
 */
export async function createTestingModule(): Promise<TestingModule> {
  const modulo = await Test.createTestingModule({
    imports: [AccountsModule, LedgerModule, StatementsModule, TransfersModule],
  })
    .overrideProvider(DATABASE_URL)
    .useValue(TEST_DATABASE_URL)
    .compile();

  await modulo.init();

  return modulo;
}

/**
 * Deja la base vacía entre tests.
 *
 * `TRUNCATE` y no `DELETE` por un motivo que no es la velocidad: los asientos
 * tienen un trigger `BEFORE UPDATE OR DELETE` que rechaza borrarlos. `TRUNCATE`
 * no es ninguna de las dos cosas, así que pasa por encima — que es justo lo que
 * hace falta para limpiar sin tener que desactivar la garantía que se prueba.
 */
export async function truncateAll(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "entries", "transactions", "accounts" RESTART IDENTITY CASCADE',
  );
}
