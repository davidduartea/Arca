import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { TestingModule } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";

import { AccountsModule } from "../accounts/accounts.module";
import { AppModule } from "../app.module";
import { AuditModule } from "../audit/audit.module";
import { JWT_SECRET } from "../auth/token.service";
import { securityHeaders } from "../http/security-headers";
import { LedgerModule } from "../ledger/ledger.module";
import { DATABASE_URL, PrismaService } from "../prisma/prisma.service";
import { READER_DATABASE_URL } from "../prisma/reader.service";
import { SYSTEM_USER_ID, WORLD_ACCOUNT_ID } from "../shared/system-account";
import { StatementsModule } from "../statements/statements.module";
import { TransfersModule } from "../transfers/transfers.module";
import { TEST_DATABASE_URL, TEST_LEDGER_URL, TEST_READER_URL } from "./database-url";

/** Cualquier cosa larga sirve: los tests sólo necesitan firmar y verificar. */
const TEST_JWT_SECRET = "secreto-de-pruebas-suficientemente-largo-para-el-esquema";

/** Deja pasar todo, para los tests que no van sobre la limitación de intentos. */
const NO_LIMIT = { canActivate: (): boolean => true };

/**
 * Levanta los servicios apuntando a la base de pruebas.
 *
 * `init()` dispara `onModuleInit`, que es quien abre la conexión; sin eso el
 * primer test fallaría con el pool cerrado.
 */
export async function createTestingModule(): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [AccountsModule, AuditModule, LedgerModule, StatementsModule, TransfersModule],
  })
    .overrideProvider(DATABASE_URL)
    .useValue(TEST_LEDGER_URL)
    .overrideProvider(READER_DATABASE_URL)
    .useValue(TEST_READER_URL)
    .compile();

  await moduleRef.init();

  return moduleRef;
}

/**
 * Levanta la aplicación entera, con sus guardias y su filtro de errores.
 *
 * Es lo que hace falta para probar por HTTP: los códigos de estado, la
 * traducción de errores del dominio y el hecho de que el guardia sea global no
 * se pueden comprobar llamando a los servicios a pelo.
 */
export async function createTestingApp({ throttle = false } = {}): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DATABASE_URL)
    .useValue(TEST_LEDGER_URL)
    .overrideProvider(READER_DATABASE_URL)
    .useValue(TEST_READER_URL)
    .overrideProvider(JWT_SECRET)
    .useValue(TEST_JWT_SECRET);

  // La limitación se desactiva salvo donde se esté probando: cinco intentos por
  // minuto son suficientes para una persona y ridículos para una suite que
  // inicia sesión veinte veces.
  if (!throttle) builder.overrideProvider(ThrottlerGuard).useValue(NO_LIMIT);

  const app = (await builder.compile()).createNestApplication();

  // La misma línea que `main.ts`, y por eso está aquí: unas cabeceras que sólo
  // existen en producción no las prueba nadie, y se caen sin que se note.
  app.use(securityHeaders);

  await app.init();

  return app;
}

/** Se abre una vez y se reutiliza; Vitest corre los archivos de uno en uno. */
let owner: PrismaClient | undefined;

/**
 * La conexión que puede con todo, para lo que un test tiene que montar o
 * deshacer y la aplicación no debe poder hacer nunca.
 *
 * Son tres cosas: vaciar tablas entre casos, borrar un usuario para simular que
 * se fue, y quitar y poner triggers para comprobar que la auditoría se entera
 * cuando la base deja de garantizar lo que garantizaba. Las tres son DDL o
 * borrados, y **ninguno de los dos roles de la aplicación las tiene** — que es
 * justo lo que se buscaba. Hace falta la dueña del esquema, la misma que aplica
 * las migraciones, y por eso está aquí y no se le pide a `PrismaService`.
 */
export function schemaOwner(): PrismaClient {
  owner ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }),
  });

  return owner;
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
export async function truncateAll(): Promise<void> {
  const db = schemaOwner();

  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "entries", "transactions" RESTART IDENTITY CASCADE',
  );
  await db.$executeRawUnsafe(`DELETE FROM "accounts" WHERE id <> '${WORLD_ACCOUNT_ID}'::uuid`);
  await db.$executeRawUnsafe(`DELETE FROM "users" WHERE id <> '${SYSTEM_USER_ID}'::uuid`);
}

/**
 * Un dueño de verdad al que puedan apuntar las cuentas.
 *
 * Desde que `accounts.owner_id` tiene clave foránea, un uuid inventado ya no
 * sirve — que es exactamente el agujero que la clave cierra.
 */
export async function createOwner(prisma: PrismaService): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `${randomUUID()}@arca.test`,
      name: "Dueña de pruebas",
      passwordHash: "sin-acceso",
    },
    select: { id: true },
  });

  return user.id;
}
