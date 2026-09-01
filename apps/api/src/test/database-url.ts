/**
 * A qué base apuntan los tests, y con qué rol.
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

/**
 * Los usuarios de conexión que crea `scripts/local-roles.mjs`.
 *
 * **Estos tres valores tienen que coincidir con los de ese script.** Están
 * escritos dos veces porque el script lo ejecuta `node` a pelo y aquí no se
 * puede importar sin abrir `allowJs` en el proyecto entero. Si algún día no
 * coincidieran, los tests fallarían al conectarse y lo dirían en la primera
 * línea; no es de los desajustes que se quedan callados.
 */
const ROLE_PASSWORD = "arca-local";
const READER_USER = "arca_reader_local";
const LEDGER_USER = "arca_ledger_local";

/**
 * La misma base, con otro usuario dentro.
 *
 * La aplicación bajo test **no** se conecta como dueña, y es deliberado: la
 * dueña se salta RLS por definición y puede con todo, así que la suite entera
 * pasaría en verde sobre una frontera que en producción no existiría. Entrando
 * con el rol de verdad, un permiso que falte se cae aquí y no allí.
 */
function asRoleUser(user: string): string {
  const url = new URL(TEST_DATABASE_URL);
  url.username = user;
  url.password = ROLE_PASSWORD;

  return url.toString();
}

/** Con la que se mueve el dinero: ve el libro entero, no puede reescribirlo. */
export const TEST_LEDGER_URL = asRoleUser(LEDGER_USER);

/** Con la que se sirve a alguien lo suyo: sólo lee, y sólo lo que le toca. */
export const TEST_READER_URL = asRoleUser(READER_USER);
