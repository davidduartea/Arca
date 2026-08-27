/**
 * El dinero, de la API a la pantalla y de vuelta.
 *
 * La API manda y recibe **centavos como texto**, nunca como número JSON. Aquí
 * no se convierte a `number` en ningún punto del camino: en cuanto un importe
 * pasa por coma flotante, `0.1 + 0.2` deja de ser `0.3` y la diferencia se
 * acumula hasta que los libros dejan de cuadrar.
 */

/** El menos tipográfico (U+2212), no el guion del teclado: alinea con las cifras. */
const MINUS = "−";

const CENTS_PER_DOLLAR = 100n;

/**
 * Lo que se acepta en un campo de importe.
 *
 * Un separador opcional — punto o coma, las dos valen — con uno o dos
 * decimales detrás. `1250.50` y `1250,50` son lo mismo.
 *
 * **El separador de miles no se acepta**, y es a propósito: `1.250` significa
 * mil doscientos cincuenta para quien escribe en castellano y uno con
 * veinticinco para quien escribe en inglés. Con dinero, una ambigüedad así no
 * se adivina — se rechaza y se pide claridad.
 */
const TYPED_AMOUNT = /^(\d+)(?:[.,](\d{1,2}))?$/;

export class InvalidAmountError extends Error {
  constructor(readonly typed: string) {
    super(`«${typed}» no es un importe`);
    this.name = "InvalidAmountError";
  }
}

/** `"125000"` → `"$1,250.00"`. Sin signo: para saldos. */
export function formatUsd(cents: string): string {
  const value = BigInt(cents);
  const negative = value < 0n;
  const absolute = negative ? -value : value;

  const dollars = (absolute / CENTS_PER_DOLLAR).toLocaleString("en-US");
  const remainder = (absolute % CENTS_PER_DOLLAR).toString().padStart(2, "0");

  return `${negative ? MINUS : ""}$${dollars}.${remainder}`;
}

/**
 * `"300000"` → `"+$3,000.00"`. Con signo: para importes de movimiento.
 *
 * El signo es lo que distingue lo que entra de lo que sale — no el color. Así
 * se lee igual sin distinguir colores y sin depender de la pantalla.
 */
export function formatSigned(cents: string): string {
  const value = BigInt(cents);

  return value < 0n ? formatUsd(cents) : `+${formatUsd(cents)}`;
}

/**
 * De lo que se escribe en un campo a lo que espera la API.
 *
 * `"1250.5"` → `"125050"`. Se hace con texto, nunca con aritmética decimal:
 * `parseFloat("1250.5") * 100` da 125049.99999999999 en algunos casos.
 *
 * Sólo se limpian el símbolo y los espacios. Las comas **no**: quitarlas
 * convertiría `1250,50` en `125050`, que luego se leería como un entero y
 * acabaría siendo $125.050 — cien veces de más, sin que nadie se entere.
 */
export function dollarsToCents(typed: string): string {
  const cleaned = typed.trim().replace(/[$\s]/g, "");
  const match = TYPED_AMOUNT.exec(cleaned);

  if (!match) throw new InvalidAmountError(typed);

  const [, whole = "0", fraction = ""] = match;
  const cents = `${whole}${fraction.padEnd(2, "0")}`.replace(/^0+(?=\d)/, "");

  if (cents === "0") throw new InvalidAmountError(typed);

  return cents;
}

/** Para rellenar un campo con un importe que ya existe. */
export function centsToTyped(cents: string): string {
  const value = BigInt(cents);
  const absolute = value < 0n ? -value : value;

  return `${absolute / CENTS_PER_DOLLAR}.${(absolute % CENTS_PER_DOLLAR).toString().padStart(2, "0")}`;
}
