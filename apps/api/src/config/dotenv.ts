import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Carga el `.env` de desarrollo, si lo hay.
 *
 * Nest **no lo hace solo**. Sin esta llamada, `loadEnvironment()` no encuentra
 * nada y el proceso no arranca — que es exactamente lo que pasaba: como los
 * tests sustituyen la configuración por inyección, el fallo no salía hasta que
 * alguien intentaba levantar el servidor o correr un comando.
 *
 * `existsSync` porque en producción no hay archivo: las variables vienen del
 * entorno de verdad. Y `process.loadEnvFile` **no pisa** lo que ya esté puesto,
 * así que un `.env` olvidado en un servidor no puede ganarle al entorno real.
 *
 * Es nativo desde Node 20.12; no hace falta dotenv sólo para esto.
 */
export function loadDotEnvFile(): void {
  const filePath = path.join(process.cwd(), ".env");

  if (existsSync(filePath)) process.loadEnvFile(filePath);
}
