export interface TransferOrder {
  fromAccountId: string;
  toAccountId: string;

  /** Centavos, siempre positivo. La dirección la marcan las cuentas, no el signo. */
  amount: bigint;

  description?: string;

  /** Para poder reintentar sin cobrar dos veces si se cae la red. */
  idempotencyKey?: string;
}
