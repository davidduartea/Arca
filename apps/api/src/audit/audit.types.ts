/**
 * Crítico es que el dinero no cuadre: algo apareció o desapareció, y hasta que
 * se explique el libro no vale. Aviso es suciedad que no mueve dinero — molesta
 * y hay que limpiarla, pero nadie está perdiendo nada.
 */
export type Severity = "critical" | "warning";

export interface Finding {
  /** Identificador estable del control, para poder alertar sobre él por nombre. */
  check: string;
  severity: Severity;

  /** Qué ha salido mal, en una frase. */
  summary: string;

  /** Cuántas filas lo incumplen. */
  count: number;

  /** Unos pocos ejemplos: un informe no vuelca la base entera. */
  sample: string[];
}

export interface AuditTotals {
  accounts: number;
  transactions: number;
  entries: number;

  /**
   * La suma de **todos** los asientos del sistema. Tiene que ser cero.
   *
   * Es la cifra que resume el libro entero: si no es cero, en algún sitio se
   * creó o se destruyó dinero, y da igual lo bien que cuadre cada transacción
   * por separado.
   */
  netAmount: bigint;
}

export interface AuditReport {
  checkedAt: Date;

  /** Sin ningún hallazgo, de cualquier gravedad. */
  clean: boolean;

  totals: AuditTotals;
  findings: Finding[];
}
