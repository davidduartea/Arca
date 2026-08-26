/**
 * A qué base apuntan los tests.
 *
 * Vive en su propio archivo, sin importar nada de Nest, para que el arranque
 * global de Vitest pueda leerlo sin arrastrar la aplicación entera.
 */
export const TEST_DATABASE_URL =
  process.env["TEST_DATABASE_URL"] ??
  "postgresql://arca:arca@localhost:5433/arca_test?schema=public";

export function testDatabaseName(): string {
  return new URL(TEST_DATABASE_URL).pathname.slice(1);
}
