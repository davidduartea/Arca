/**
 * Los dos usuarios de conexión del Postgres de casa.
 *
 * La migración `dos_roles_y_rls` crea `arca_reader` y `arca_ledger`, que llevan
 * los permisos pero **no pueden conectarse**: son roles de grupo. Quien se
 * conecta es un usuario con contraseña, y esa contraseña depende del entorno —
 * por eso no está en ninguna migración. En producción se crea a mano una vez
 * (ver `docs/despliegue.md`); en casa y en el CI la crea esto.
 *
 * Es idempotente. Los roles son del cluster entero, así que una sola pasada
 * vale para la base de desarrollo y para la de pruebas.
 *
 *   pnpm db:roles
 *
 * Imprime por la salida estándar las dos cadenas de conexión ya montadas, en
 * JSON. Así el arranque de los tests puede llamarlo y quedarse con ellas sin
 * tener que repetir aquí los nombres ni la contraseña.
 *
 * La contraseña es fija y está a la vista **a propósito**: este Postgres sólo
 * escucha en 127.0.0.1 y no guarda nada que exista mañana. Si esto acabara
 * apuntando a una base de verdad, el problema no sería la contraseña.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";

// Igual que `prisma.config.ts`: aqui nadie carga el `.env` por nosotros.
const envPath = path.join(process.cwd(), ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const PASSWORD = "arca-local";

const USERS = [
  { group: "arca_reader", user: "arca_reader_local", key: "reader" },
  { group: "arca_ledger", user: "arca_ledger_local", key: "ledger" },
];

/** La misma cadena del dueño, con otro usuario y otra contraseña dentro. */
function asRoleUser(ownerUrl, user) {
  const url = new URL(ownerUrl);
  url.username = user;
  url.password = PASSWORD;

  return url.toString();
}

// `DIRECT_URL` antes que `DATABASE_URL` y no al reves: desde que la aplicacion
// entra con el rol del libro, `DATABASE_URL` ya NO es la de la duena — y crear
// los roles con el usuario que este script existe para crear no funcionaria.
const ownerUrl =
  process.env["DATABASE_OWNER_URL"] ?? process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"];

if (!ownerUrl) {
  console.error("Falta DIRECT_URL: la de la dueña, la misma que aplica las migraciones.");
  process.exit(1);
}

const client = new Client({ connectionString: ownerUrl });
await client.connect();

try {
  for (const { group, user } of USERS) {
    // Postgres no tiene `CREATE ROLE IF NOT EXISTS`. El `ALTER` de después deja
    // la contraseña puesta aunque el usuario ya estuviera, que es lo que hace
    // que esto se pueda repetir sin pensar.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${user}') THEN
          CREATE ROLE ${user} LOGIN;
        END IF;
      END
      $$;
    `);
    await client.query(`ALTER ROLE ${user} WITH PASSWORD '${PASSWORD}'`);

    // Uno y sólo uno. Ser miembro de los dos sumaría las políticas de ambos, y
    // las permisivas se suman: la del libro lo enseña todo y se comería a la
    // del lector sin que nada avisara.
    await client.query(`REVOKE arca_reader, arca_ledger FROM ${user}`);
    await client.query(`GRANT ${group} TO ${user}`);
  }
} finally {
  await client.end();
}

const urls = Object.fromEntries(
  USERS.map(({ key, user }) => [key, asRoleUser(ownerUrl, user)]),
);

console.log(JSON.stringify(urls));
