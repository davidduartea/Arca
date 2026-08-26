import { randomUUID } from "node:crypto";

import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { TestingModule } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";

import { AccountsModule } from "../accounts/accounts.module";
import { AppModule } from "../app.module";
import { JWT_SECRET } from "../auth/token.service";
import { LedgerModule } from "../ledger/ledger.module";
import { DATABASE_URL, PrismaService } from "../prisma/prisma.service";
import { SYSTEM_USER_ID, WORLD_ACCOUNT_ID } from "../shared/system-account";
import { StatementsModule } from "../statements/statements.module";
import { TransfersModule } from "../transfers/transfers.module";
import { TEST_DATABASE_URL } from "./database-url";

/** Cualquier cosa larga sirve: los tests sólo necesitan firmar y verificar. */
const TEST_JWT_SECRET = "secreto-de-pruebas-suficientemente-largo-para-el-esquema";

/** Deja pasar todo, para los tests que no van sobre la limitación de intentos. */
const SIN_LIMITE = { canActivate: (): boolean => true };

/**
 * Levanta los servicios apuntando a la base de pruebas.
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
 * Levanta la aplicación entera, con sus guardias y su filtro de errores.
 *
 * Es lo que hace falta para probar por HTTP: los códigos de estado, la
 * traducción de errores del dominio y el hecho de que el guardia sea global no
 * se pueden comprobar llamando a los servicios a pelo.
 */
export async function createTestingApp({ throttle = false } = {}): Promise<INestApplication> {
  const constructor = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DATABASE_URL)
    .useValue(TEST_DATABASE_URL)
    .overrideProvider(JWT_SECRET)
    .useValue(TEST_JWT_SECRET);

  // La limitación se desactiva salvo donde se esté probando: cinco intentos por
  // minuto son suficientes para una persona y ridículos para una suite que
  // inicia sesión veinte veces.
  if (!throttle) constructor.overrideProvider(ThrottlerGuard).useValue(SIN_LIMITE);

  const app = (await constructor.compile()).createNestApplication();
  await app.init();

  return app;
}

/**
 * Deja la base como recién migrada.
 *
 * `TRUNCATE` y no `DELETE` para los asientos: llevan un trigger
 * `BEFORE UPDATE OR DELETE` que rechaza borrarlos, y `TRUNCATE` no es ninguna
 * de las dos cosas. Así se limpia sin desactivar la garantía que se prueba.
 *
 * Las cuentas y los usuarios sí se borran uno a uno, para **conservar las filas
 * del sistema** que creó la migración. Volver a insertarlas aquí duplicaría esa
 * semilla en dos sitios que se pueden desincronizar.
 */
export async function truncateAll(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "entries", "transactions" RESTART IDENTITY CASCADE',
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "accounts" WHERE id <> '${WORLD_ACCOUNT_ID}'::uuid`,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "users" WHERE id <> '${SYSTEM_USER_ID}'::uuid`);
}

/**
 * Un dueño de verdad al que puedan apuntar las cuentas.
 *
 * Desde que `accounts.owner_id` tiene clave foránea, un uuid inventado ya no
 * sirve — que es exactamente el agujero que la clave cierra.
 */
export async function createOwner(prisma: PrismaService): Promise<string> {
  const usuario = await prisma.user.create({
    data: { email: `${randomUUID()}@arca.test`, passwordHash: "sin-acceso" },
    select: { id: true },
  });

  return usuario.id;
}
