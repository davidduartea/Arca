import { randomInt } from "node:crypto";

/**
 * El número de arca: doce cifras, tres grupos de cuatro.
 *
 *   ARCA 4718 2093 6641
 *        ^^^^ ^^^^ ^^^^
 *        │    │       └─ dígito de control
 *        │    └────────── la cuenta
 *        └─────────────── emisión
 *
 * Sólo cifras, y es deliberado: por teléfono la «B» y la «D» se confunden, y
 * el «0» con la «O». Doce dígitos dan 10¹² combinaciones, de sobra.
 *
 * Los grupos de cuatro son los de una tarjeta — la agrupación que la gente ya
 * sabe dictar y teclear sin pensar.
 *
 * El prefijo `ARCA` **no forma parte del número**. Va impreso en el campo y
 * sirve para reconocerlo pegado en un chat, no para escribirlo.
 */

/** Grupo de emisión. Fijo, como el de una tarjeta. */
const ISSUANCE = "4718";

const LENGTH = 12;
const BODY_LENGTH = LENGTH - 1;

/**
 * Pesos del dígito de control, de derecha a izquierda.
 *
 * Es el mod 11 clásico. Detecta cualquier cifra cambiada y —lo que de verdad
 * importa— también las **transposiciones**, que son el error de copia más
 * común: teclear 2093 donde ponía 2039.
 */
const WEIGHTS = [2, 3, 4, 5, 6, 7, 2, 3, 4, 5, 6];

/** Cuando el resto obliga a un «10», ese número no se emite. */
const UNUSABLE = 10;

/** Se acepta con guiones, con espacios, todo junto, y con o sin prefijo. */
const PREFIX = /^arca[\s-]*/i;

export class InvalidAccountNumberError extends Error {
  constructor(readonly typed: string) {
    super(`«${typed}» no es un número de arca`);
    this.name = "InvalidAccountNumberError";
  }
}

/**
 * Un número nuevo, ya con su dígito de control.
 *
 * Puede tener que reintentar: cuando el mod 11 pide un «10» no hay cifra que
 * lo represente, así que ese cuerpo se descarta y se sortea otro. Pasa una vez
 * de cada once.
 */
export function generateAccountNumber(): string {
  for (;;) {
    let body = ISSUANCE;
    while (body.length < BODY_LENGTH) body += randomInt(10).toString();

    const check = checkDigit(body);
    if (check !== UNUSABLE) return `${body}${check}`;
  }
}

/**
 * Normaliza lo que alguien haya escrito o pegado.
 *
 * Devuelve las doce cifras a secas. Lanza si no son doce, o si el dígito de
 * control no cuadra — que es lo que convierte un número mal copiado en un
 * error que se ve al momento, sin preguntarle al servidor.
 */
export function parseAccountNumber(typed: string): string {
  const digits = typed.replace(PREFIX, "").replace(/[\s-]/g, "");

  if (!/^\d{12}$/.test(digits)) throw new InvalidAccountNumberError(typed);

  const body = digits.slice(0, BODY_LENGTH);
  const check = Number(digits.slice(BODY_LENGTH));

  if (checkDigit(body) !== check) throw new InvalidAccountNumberError(typed);

  return digits;
}

/** `"471820936641"` → `"4718 2093 6641"`. Como se enseña en pantalla. */
export function formatAccountNumber(number: string): string {
  return `${number.slice(0, 4)} ${number.slice(4, 8)} ${number.slice(8)}`;
}

function checkDigit(body: string): number {
  let sum = 0;

  // De derecha a izquierda, que es como funciona el mod 11.
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (WEIGHTS[i] ?? 0);
  }

  return (11 - (sum % 11)) % 11;
}
