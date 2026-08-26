/** Una línea del extracto: un asiento, con contexto y saldo. */
export interface StatementLine {
  entryId: string;
  transactionId: string;

  /** La descripción del movimiento al que pertenece el asiento. */
  description: string;

  /** Centavos. Negativo sale de la cuenta, positivo entra. */
  amount: bigint;

  /** Saldo de la cuenta justo **después** de este asiento. */
  balance: bigint;

  /** Si el movimiento corrige a otro anterior. */
  isReversal: boolean;

  createdAt: Date;
}

export interface StatementPage {
  /** Del más reciente al más antiguo, como se lee un extracto. */
  lines: StatementLine[];

  /**
   * Se devuelve tal cual para pedir la siguiente página. `null` cuando ya no
   * queda nada — y sólo entonces, nunca «por si acaso».
   */
  nextCursor: string | null;
}

export interface StatementQuery {
  /** El `nextCursor` de la página anterior. */
  cursor?: string;

  /** Cuántas líneas como mucho. Por defecto 50, tope 100. */
  limit?: number;
}
