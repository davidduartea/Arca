import { execSync } from "node:child_process";

import { Client } from "pg";

import { TEST_DATABASE_URL, testDatabaseName } from "./database-url";

/** La base de desarrollo, que los tests no deben tocar jamás. */
const BASE_DE_DESARROLLO = "arca";

/**
 * Prepara la base de pruebas antes de que corra ningún test.
 *
 * Los tests son de integración contra Postgres de verdad, no contra dobles: lo
 * que se está probando aquí es en buena parte lo que garantiza la propia base
 * — los triggers de la migración — y un doble no tiene triggers.
 */
export default async function setup(): Promise<void> {
  const nombre = testDatabaseName();

  // Los tests hacen TRUNCATE. Si alguien apunta TEST_DATABASE_URL a la base de
  // desarrollo, se lleva sus datos por delante sin avisar.
  if (nombre === BASE_DE_DESARROLLO) {
    throw new Error(
      `La base de pruebas no puede ser «${BASE_DE_DESARROLLO}», que es la de desarrollo: ` +
        "los tests la vaciarían. Cambia TEST_DATABASE_URL.",
    );
  }

  await crearSiFalta(nombre);

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
async function crearSiFalta(nombre: string): Promise<void> {
  const admin = new URL(TEST_DATABASE_URL);
  admin.pathname = "/postgres";
  admin.search = "";

  const client = new Client({ connectionString: admin.toString() });
  await client.connect();

  try {
    const existe = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [nombre]);
    if (existe.rowCount === 0) {
      await client.query(`CREATE DATABASE "${nombre}"`);
    }
  } finally {
    await client.end();
  }
}
