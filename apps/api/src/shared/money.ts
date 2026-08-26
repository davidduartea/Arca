/**
 * El dinero se guarda en centavos como entero y sólo se formatea al mostrarlo.
 *
 * Nunca al revés: en cuanto un importe pasa por un decimal para «dar formato»,
 * `0.1 + 0.2` deja de ser `0.3` y la diferencia se acumula hasta que los libros
 * dejan de cuadrar.
 */
const CENTAVOS_POR_DOLAR = 100n;

export function formatUsd(centavos: bigint): string {
  const negativo = centavos < 0n;
  const absoluto = negativo ? -centavos : centavos;

  const dolares = absoluto / CENTAVOS_POR_DOLAR;
  const resto = absoluto % CENTAVOS_POR_DOLAR;

  return `${negativo ? "-" : ""}$${dolares}.${resto.toString().padStart(2, "0")}`;
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
export function toWire(centavos: bigint): string {
  return centavos.toString();
}
