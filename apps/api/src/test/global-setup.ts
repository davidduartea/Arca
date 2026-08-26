import { execSync } from "node:child_process";

import { Client } from "pg";

import { TEST_DATABASE_URL, testDatabaseName } from "./database-url";

/** La base de desarrollo, que los tests no deben tocar jamás. */
const DEVELOPMENT_DATABASE = "arca";

/**
 * Prepara la base de pruebas antes de que corra ningún test.
 *
 * Los tests son de integración contra Postgres de verdad, no contra dobles: lo
 * que se está probando aquí es en buena parte lo que garantiza la propia base
 * — los triggers de la migración — y un doble no tiene triggers.
 */
export default async function setup(): Promise<void> {
  const name = testDatabaseName();

  // Los tests hacen TRUNCATE. Si alguien apunta TEST_DATABASE_URL a la base de
  // desarrollo, se lleva sus datos por delante sin avisar.
  if (name === DEVELOPMENT_DATABASE) {
    throw new Error(
      `La base de pruebas no puede ser «${DEVELOPMENT_DATABASE}», que es la de desarrollo: ` +
        "los tests la vaciarían. Cambia TEST_DATABASE_URL.",
    );
  }

  await createIfMissing(name);

  // `migrate deploy` y no `migrate dev`: aplica lo que hay y no inventa
  // migraciones nuevas si el esquema se movió.
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_URL: TEST_DATABASE_URL,
    },
  });
}

/**
 * `CREATE DATABASE` no se puede lanzar desde dentro de la base que se crea, así
 * que hay que conectarse a otra. `postgres` siempre existe.
 */
async function createIfMissing(name: string): Promise<void> {
  const admin = new URL(TEST_DATABASE_URL);
  admin.pathname = "/postgres";
  admin.search = "";

  const client = new Client({ connectionString: admin.toString() });
  await client.connect();

  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await client.end();
  }
}
