import { existsSync } from "node:fs";
import path from "node:path";

import { defineConfig, env } from "prisma/config";

/**
 * Configuración de Prisma.
 *
 * En Prisma 7 la URL de conexión **salió del esquema** y vive aquí. El esquema
 * sólo declara el motor; quien dice a qué base apuntar es este archivo, y el
 * cliente lo hace por su cuenta con un adaptador de driver.
 * 📖 https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
 *
 * OJO: en cuanto existe este archivo, Prisma deja de cargar `.env` solo — lo
 * avisa con «Prisma config detected, skipping environment variable loading».
 * Hay que cargarlo a mano o `DATABASE_URL` llega vacía y ni siquiera valida.
 *
 * `process.loadEnvFile` es nativo desde Node 20.12, así que no hace falta
 * añadir dotenv sólo para esto.
 */
const envPath = path.join(process.cwd(), ".env");

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

/**
 * A qué base apuntan las **migraciones**, que no tiene por qué ser la misma
 * conexión que usa la aplicación.
 *
 * Esto sólo lo lee la herramienta de línea de órdenes — `migrate`, `studio`,
 * `db pull`. Quien atiende peticiones construye su cliente con `DATABASE_URL` y
 * un adaptador de driver, y no pasa por aquí.
 *
 * La distinción existe porque un Postgres gestionado suele ofrecer dos puertas.
 * La de la aplicación va por un pooler en modo transacción, que reparte una
 * misma conexión entre muchas peticiones y por eso **no admite las sentencias
 * DDL** de una migración: `CREATE TABLE` y `ALTER TABLE` mueren ahí. Las
 * migraciones necesitan una conexión de sesión, que es otra puerta y otro
 * puerto.
 *
 * Es el fallo más silencioso de ese montaje: con una sola URL el servicio
 * arranca, consulta bien, y sólo se cae el día que hay una migración pendiente.
 *
 * En local las dos son la misma base, así que `DIRECT_URL` sobra y el respaldo
 * evita tener que escribir la misma cadena dos veces.
 */
const migrationUrl = process.env["DIRECT_URL"] ? env("DIRECT_URL") : env("DATABASE_URL");

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: migrationUrl,
  },
});
