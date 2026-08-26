/**
 * Las claves son columnas `uuid` de Postgres.
 *
 * Sin esta comprobación, buscar por un id mal formado no devuelve «no existe»:
 * revienta con un error de casteo de Postgres, que acaba siendo un 500 cuando
 * debería ser un 404. Comprobar la forma antes convierte el fallo en un caso
 * normal del dominio.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(valor: string): boolean {
  return UUID.test(valor);
}
