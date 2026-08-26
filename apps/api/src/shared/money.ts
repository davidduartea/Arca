/**
 * El dinero se guarda en centavos como entero y sólo se formatea al mostrarlo.
 *
 * Nunca al revés: en cuanto un importe pasa por un decimal para «dar formato»,
 * `0.1 + 0.2` deja de ser `0.3` y la diferencia se acumula hasta que los libros
 * dejan de cuadrar.
 */
const CENTS_PER_DOLLAR = 100n;

export function formatUsd(cents: bigint): string {
  const isNegative = cents < 0n;
  const absolute = isNegative ? -cents : cents;

  const dollars = absolute / CENTS_PER_DOLLAR;
  const remainder = absolute % CENTS_PER_DOLLAR;

  return `${isNegative ? "-" : ""}$${dollars}.${remainder.toString().padStart(2, "0")}`;
}

/**
 * Los importes cruzan el cable como **texto**, nunca como número JSON.
 *
 * Un número en JSON es un `double` de IEEE 754. En cuanto un importe supera los
 * 2^53 centavos, `JSON.parse` lo redondea en silencio — el mismo problema de
 * precisión que el proyecto evita guardando enteros volvería a entrar por la
 * puerta de la API, y sin que nadie se entere.
 *
 * Con texto, quien recibe decide: `BigInt(valor)` si va a operar, o mostrarlo
 * tal cual. Lo que no puede es perderlo por el camino.
 */
export function toWire(cents: bigint): string {
  return cents.toString();
}
