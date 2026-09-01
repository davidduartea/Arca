export interface TransferOrder {
  fromAccountId: string;
  toAccountId: string;

  /** Centavos, siempre positivo. La dirección la marcan las cuentas, no el signo. */
  amount: bigint;

  description?: string;

  /** Para poder reintentar sin cobrar dos veces si se cae la red. */
  idempotencyKey?: string;
}

/**
 * Quién quiere anular qué.
 *
 * No lleva clave de idempotencia y no le hace falta: el índice único sobre
 * `reverses_id` ya impide que una transacción se anule dos veces, así que
 * reintentar no duplica nada — devuelve el conflicto de que ya está anulada,
 * que para quien reintenta es la misma noticia.
 */
export interface ReversalOrder {
  transactionId: string;

  /** Quien lo pide. Tiene que ser dueño de alguna cuenta que cobrase. */
  ownerId: string;

  description?: string;
}
