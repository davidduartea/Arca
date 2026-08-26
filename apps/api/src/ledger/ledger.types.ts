/**
 * Los tipos del motor de asientos.
 *
 * Los importes son `bigint` de **centavos**, nunca `number`. Un `number` de
 * JavaScript pierde precisión por encima de 2^53 y, peor, invita a que alguien
 * escriba `10.50` en algún sitio. Con `bigint` eso no compila.
 */

/** Una línea que se quiere registrar: cuánto se mueve en qué cuenta. */
export interface EntryDraft {
  accountId: string;
  /** Centavos. Negativo sale de la cuenta, positivo entra. Nunca cero. */
  amount: bigint;
}

/** Un movimiento completo antes de guardarse. */
export interface TransactionDraft {
  description: string;

  /** Dos o más, y la suma de sus importes tiene que ser cero. */
  entries: EntryDraft[];

  /**
   * La clave que manda el cliente para poder reintentar sin duplicar.
   * Si llega repetida, se devuelve la transacción original en vez de crear otra.
   */
  idempotencyKey?: string;
}

export interface PostedEntry {
  id: string;
  accountId: string;
  amount: bigint;
}

export interface PostedTransaction {
  id: string;
  description: string;
  idempotencyKey: string | null;

  /** Qué transacción anula ésta, si es una corrección. */
  reversesId: string | null;

  createdAt: Date;
  entries: PostedEntry[];
}
