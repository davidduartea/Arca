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
