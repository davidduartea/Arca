import { randomBytes, scrypt as scryptConCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptConCallback) as (
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
const COSTE = 2 ** 16;
const BLOQUE = 8;
const PARALELISMO = 2;
const MEMORIA_MAXIMA = 192 * 1024 * 1024;

const LONGITUD_SAL = 16;
const LONGITUD_CLAVE = 32;
const ETIQUETA = "scrypt";
const SEPARADOR = "$";

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
  const sal = randomBytes(LONGITUD_SAL);
  const clave = await derivar(password, sal, { N: COSTE, r: BLOQUE, p: PARALELISMO });

  return [
    ETIQUETA,
    COSTE,
    BLOQUE,
    PARALELISMO,
    sal.toString("base64url"),
    clave.toString("base64url"),
  ].join(SEPARADOR);
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
export async function verifyPassword(password: string, guardado: string): Promise<boolean> {
  const partes = guardado.split(SEPARADOR);
  if (partes.length !== 6 || partes[0] !== ETIQUETA) return false;

  const [, coste, bloque, paralelismo, sal, esperada] = partes;
  const parametros = {
    N: Number(coste),
    r: Number(bloque),
    p: Number(paralelismo),
  };

  if (!Object.values(parametros).every((valor) => Number.isInteger(valor) && valor > 0)) {
    return false;
  }
  if (sal === undefined || esperada === undefined) return false;

  const referencia = Buffer.from(esperada, "base64url");
  if (referencia.length !== LONGITUD_CLAVE) return false;

  const candidata = await derivar(password, Buffer.from(sal, "base64url"), parametros);

  // `timingSafeEqual` y no `===`: comparar bytes hasta el primero que difiere
  // tarda distinto según cuántos coincidan, y ese tiempo se puede medir.
  return timingSafeEqual(candidata, referencia);
}

function derivar(
  password: string,
  sal: Buffer,
  parametros: { N: number; r: number; p: number },
): Promise<Buffer> {
  return scrypt(password, sal, LONGITUD_CLAVE, { ...parametros, maxmem: MEMORIA_MAXIMA });
}
