import { randomBytes, scrypt as scryptWithCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptWithCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Parámetros de scrypt.
 *
 * `N = 2^16`, `r = 8`, `p = 2` es una de las configuraciones que recomienda
 * OWASP. La memoria que gasta es `128 · N · r`, o sea 64 MB por hash, y eso es
 * justamente el punto: encarece el ataque en paralelo, que es como se rompen
 * las contraseñas de verdad — con GPUs probando millones por segundo. Una
 * función rápida como SHA-256 no protege nada, por muchas vueltas que se le dé.
 *
 * `maxmem` hay que pasarlo a mano: Node lo limita a 32 MB por defecto y con
 * estos parámetros la llamada fallaría.
 */
const COST = 2 ** 16;
const BLOCK_SIZE = 8;
const PARALLELISM = 2;
const MAX_MEMORY = 192 * 1024 * 1024;

const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const LABEL = "scrypt";
const SEPARATOR = "$";

/**
 * Se usa scrypt y no argon2id, que sería la primera opción.
 *
 * argon2 es un módulo nativo: hay que compilarlo al instalar, y este proyecto
 * niega por defecto los scripts de instalación (`strictDepBuilds` en
 * `pnpm-workspace.yaml`) porque un paquete comprometido suele entregar su carga
 * desde ahí. Meter una excepción para poder hashear contraseñas es debilitar la
 * política justo en el módulo que más la necesita.
 *
 * scrypt viene dentro de Node, no añade dependencia ninguna y OWASP lo da por
 * bueno. Es peor que argon2id contra ataques con hardware a medida, y mejor que
 * cualquier cosa que llegue con un `postinstall` sin revisar.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, { N: COST, r: BLOCK_SIZE, p: PARALLELISM });

  return [
    LABEL,
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join(SEPARATOR);
}

/**
 * Comprueba una contraseña contra un hash guardado.
 *
 * Los parámetros salen **del propio hash**, no de las constantes de arriba. Eso
 * es lo que permite endurecerlos mañana sin invalidar las contraseñas de todo
 * el mundo: los hashes viejos se siguen verificando con los suyos.
 *
 * Devuelve `false` ante un hash corrupto en lugar de lanzar: para quien pregunta
 * el resultado es el mismo — esa contraseña no vale — y así un registro dañado
 * no tumba el proceso.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(SEPARATOR);
  if (parts.length !== 6 || parts[0] !== LABEL) return false;

  const [, cost, blockSize, parallelism, salt, expected] = parts;
  const params = {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelism),
  };

  if (!Object.values(params).every((value) => Number.isInteger(value) && value > 0)) {
    return false;
  }
  if (salt === undefined || expected === undefined) return false;

  const reference = Buffer.from(expected, "base64url");
  if (reference.length !== KEY_LENGTH) return false;

  const candidate = await derive(password, Buffer.from(salt, "base64url"), params);

  // `timingSafeEqual` y no `===`: comparar bytes hasta el primero que difiere
  // tarda distinto según cuántos coincidan, y ese tiempo se puede medir.
  return timingSafeEqual(candidate, reference);
}

function derive(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  return scrypt(password, salt, KEY_LENGTH, { ...params, maxmem: MAX_MEMORY });
}
