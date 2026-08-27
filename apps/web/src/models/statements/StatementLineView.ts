/** Una línea del extracto: qué se movió y cuánto quedaba después. */
export interface StatementLineView {
  entryId: string;
  transactionId: string;
  description: string;

  /** Centavos con signo: negativo sale, positivo entra. */
  amount: string;

  /** El saldo de la cuenta justo **después** de este asiento. */
  balance: string;

  isReversal: boolean;
  createdAt: string;
}
