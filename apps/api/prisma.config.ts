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

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
