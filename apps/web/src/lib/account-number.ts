/**
 * El número de arca, del lado del navegador.
 *
 *   ARCA 4718 2093 6641
 *
 * Doce cifras: cuatro de emisión, siete de cuenta y una de control.
 *
 * ## Por qué esta lógica está también aquí
 *
 * Es la misma que hay en el servidor y en un `CHECK` de Postgres, y la
 * duplicación es deliberada — la misma forma que en el resto del proyecto: la
 * comprobación de aquí existe para **dar un error al momento**, mientras
 * alguien teclea y sin preguntarle nada a nadie; la garantía sigue estando
 * abajo.
 *
 * Un número mal copiado no es una consulta que deba viajar. Con el dígito de
 * control, diez de cada once errores se ven en el propio campo.
 */

/** El prefijo se enseña, no se teclea. Se acepta si viene pegado. */
const PREFIX = /^arca[\s-]*/i;

const WEIGHTS = [2, 3, 4, 5, 6, 7, 2, 3, 4, 5, 6];

export type NumberState =
  /** Aún no hay doce cifras. Ni bien ni mal: a medias. */
  | { kind: "incomplete"; digits: string }
  /** Doce cifras y el dígito de control cuadra. */
  | { kind: "valid"; number: string }
  /** Doce cifras, pero no puede existir. Casi siempre una cambiada de sitio. */
  | { kind: "impossible" };

/** Sólo las cifras: quita prefijo, guiones y espacios. */
export function digitsOf(typed: string): string {
  return typed.replace(PREFIX, "").replace(/\D/g, "");
}

/**
 * En qué punto está lo que hay escrito.
 *
 * Tres estados y no dos: mientras se teclea no hay error todavía, y enseñar uno
 * antes de la última cifra es regañar a alguien que va por la mitad.
 */
export function readAccountNumber(typed: string): NumberState {
  const digits = digitsOf(typed);

  if (digits.length !== 12) return { kind: "incomplete", digits };

  const body = digits.slice(0, 11);
  if (checkDigit(body) !== Number(digits[11])) return { kind: "impossible" };

  return { kind: "valid", number: digits };
}

/** `"471820936641"` → `"4718 2093 6641"`. Como se enseña. */
export function formatAccountNumber(number: string): string {
  return [number.slice(0, 4), number.slice(4, 8), number.slice(8)].filter(Boolean).join(" ");
}

/**
 * Lo que va al portapapeles: con prefijo y con guiones.
 *
 * Los guiones lo mantienen de una pieza cuando se pega en un chat que rompe por
 * los espacios, y el prefijo hace que se reconozca de un vistazo.
 */
export function copyableAccountNumber(number: string): string {
  return `ARCA-${number.slice(0, 4)}-${number.slice(4, 8)}-${number.slice(8)}`;
}

/** Agrupa mientras se teclea, sin estorbar. */
export function groupWhileTyping(typed: string): string {
  return formatAccountNumber(digitsOf(typed).slice(0, 12));
}

function checkDigit(body: string): number {
  let sum = 0;

  for (let i = 0; i < body.length; i++) {
    sum += Number(body[body.length - 1 - i]) * (WEIGHTS[i] ?? 0);
  }

  return (11 - (sum % 11)) % 11;
}
