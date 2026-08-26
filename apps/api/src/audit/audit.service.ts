import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import type { AuditReport, AuditTotals, Finding, Severity } from "./audit.types";

/** Cuántos ejemplos se guardan de cada hallazgo. */
const SAMPLE_SIZE = 10;

/** Forma de cada consulta: un ejemplo por fila, y el total en todas ellas. */
interface FindingRow {
  example: string;
  total: number;
}

/**
 * La auditoría del libro.
 *
 * Los triggers garantizan que **cada transacción** cuadra. Esto pregunta si
 * cuadra **el libro entero**, que no es la misma pregunta: un trigger protege
 * la fila que se está escribiendo y no sabe nada del conjunto.
 *
 * ## Por qué SQL a pelo
 *
 * Todas las consultas van escritas a mano, sin pasar por el constructor de
 * consultas de Prisma. No es nostalgia: **una auditoría que se apoya en el
 * mismo código que audita no audita nada**. Si hubiera un fallo en cómo el
 * proyecto lee o escribe asientos, una comprobación hecha con las mismas
 * herramientas lo heredaría y saldría limpia.
 *
 * ## Por qué se comprueban cosas que ya garantiza la base
 *
 * Que los asientos sumen cero lo impone un trigger, así que en teoría sobra
 * comprobarlo. Se comprueba igual, por lo mismo: un trigger se puede caer en
 * una migración mal escrita, se puede desactivar para una carga masiva y no
 * volver a activar, o puede no haber existido cuando se escribieron los datos
 * viejos. Una auditoría que sólo mira lo que nadie protege da por buena la
 * mitad del libro sin haberla mirado.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async run(): Promise<AuditReport> {
    const totals = await this.readTotals();

    // `libroDescuadrado` no consulta nada: se resuelve con el resumen que ya
    // se ha leído, así que va fuera del `Promise.all`.
    const checks = [
      this.unbalancedLedger(totals),
      ...(await Promise.all([
        this.unbalancedTransactions(),
        this.singleEntryTransactions(),
        this.emptyTransactions(),
        this.zeroAmountEntries(),
        this.overdrawnUserAccounts(),
        this.reversalsThatDoNotReverse(),
        this.orphanEntries(),
      ])),
    ];

    const findings = checks.filter((finding): finding is Finding => finding !== null);

    return {
      checkedAt: new Date(),
      clean: findings.length === 0,
      totals,
      findings,
    };
  }

  // ─── el resumen ────────────────────────────────────────────────────────────

  private async readTotals(): Promise<AuditTotals> {
    const [row] = await this.prisma.$queryRaw<
      { accounts: number; transactions: number; entries: number; net: bigint }[]
    >`
      SELECT
        (SELECT COUNT(*)::int FROM accounts)     AS accounts,
        (SELECT COUNT(*)::int FROM transactions) AS transactions,
        (SELECT COUNT(*)::int FROM entries)      AS entries,
        -- El cast no es adorno: SUM sobre bigint devuelve numeric en
        -- Postgres, y Prisma lo trae como Decimal. Sin el cast, el importe
        -- dejaría de ser un bigint justo en la cifra que resume el libro.
        (SELECT COALESCE(SUM(amount), 0)::bigint FROM entries) AS net
    `;

    return {
      accounts: row?.accounts ?? 0,
      transactions: row?.transactions ?? 0,
      entries: row?.entries ?? 0,
      netAmount: row?.net ?? 0n,
    };
  }

  // ─── los controles ─────────────────────────────────────────────────────────

  /**
   * La cifra que resume el libro entero.
   *
   * Cada asiento negativo tiene su contrapartida positiva, así que sumarlos
   * todos tiene que dar cero. Si no da, en algún sitio se creó o se destruyó
   * dinero, y da igual lo bien que cuadre cada transacción por separado.
   */
  private unbalancedLedger(totals: AuditTotals): Finding | null {
    if (totals.netAmount === 0n) return null;

    return {
      check: "ledger-unbalanced",
      severity: "critical",
      summary: `La suma de todos los asientos es ${totals.netAmount} y debería ser cero`,
      count: 1,
      sample: [`neto: ${totals.netAmount} centavos`],
    };
  }

  private async unbalancedTransactions(): Promise<Finding | null> {
    const rows = await this.prisma.$queryRaw<FindingRow[]>`
      SELECT
        transaction_id::text || ' descuadra en ' || SUM(amount)::text AS example,
        COUNT(*) OVER ()::int AS total
      FROM entries
      GROUP BY transaction_id
      HAVING SUM(amount) <> 0
      LIMIT ${SAMPLE_SIZE}
    `;

    return toFinding(
      rows,
      "unbalanced-transactions",
      "critical",
      "Hay transacciones cuyos asientos no suman cero",
    );
  }

  /**
   * Un solo asiento no es partida doble: es dinero que sale de la nada o que
   * desaparece sin destino.
   */
  private async singleEntryTransactions(): Promise<Finding | null> {
    const rows = await this.prisma.$queryRaw<FindingRow[]>`
      SELECT
        transaction_id::text AS example,
        COUNT(*) OVER ()::int AS total
      FROM entries
      GROUP BY transaction_id
      HAVING COUNT(*) = 1
      LIMIT ${SAMPLE_SIZE}
    `;

    return toFinding(
      rows,
      "single-entry-transactions",
      "critical",
      "Hay transacciones con un solo asiento",
    );
  }

  /** Suciedad: no mueve dinero, pero ensucia el histórico y no debería estar. */
  private async emptyTransactions(): Promise<Finding | null> {
    const rows = await this.prisma.$queryRaw<FindingRow[]>`
      SELECT
        t.id::text AS example,
        COUNT(*) OVER ()::int AS total
      FROM transactions t
      LEFT JOIN entries e ON e.transaction_id = t.id
      WHERE e.id IS NULL
      LIMIT ${SAMPLE_SIZE}
    `;

    return toFinding(
      rows,
      "empty-transactions",
      "warning",
      "Hay transacciones que no mueven nada",
    );
  }

  private async zeroAmountEntries(): Promise<Finding | null> {
    const rows = await this.prisma.$queryRaw<FindingRow[]>`
      SELECT
        id::text AS example,
        COUNT(*) OVER ()::int AS total
      FROM entries
      WHERE amount = 0
      LIMIT ${SAMPLE_SIZE}
    `;

    return toFinding(rows, "zero-amount-entries", "warning", "Hay asientos de importe cero");
  }

  /**
   * El control que **ninguna restricción protege**.
   *
   * Que una cuenta de persona no se quede en descubierto lo impone
   * `TransfersService` al escribir, con la cuenta bloqueada. Pero eso vive en
   * el código: un `INSERT` directo, un script de importación o una llamada al
   * motor de asientos saltándose las transferencias dejan la cuenta en negativo
   * sin que nada se queje. Esto es lo único que lo vería.
   *
   * Las cuentas de sistema quedan fuera: están en negativo por definición, y es
   * la medida de cuánto dinero ha entrado al libro desde fuera.
   */
  private async overdrawnUserAccounts(): Promise<Finding | null> {
    const rows = await this.prisma.$queryRaw<FindingRow[]>`
      SELECT
        a.id::text || ' con ' || COALESCE(SUM(e.amount), 0)::text AS example,
        COUNT(*) OVER ()::int AS total
      FROM accounts a
      LEFT JOIN entries e ON e.account_id = a.id
      WHERE a.kind = 'USER'
      GROUP BY a.id
      HAVING COALESCE(SUM(e.amount), 0) < 0
      LIMIT ${SAMPLE_SIZE}
    `;

    return toFinding(
      rows,
      "overdrawn-user-accounts",
      "critical",
      "Hay cuentas de persona con saldo negativo",
    );
  }

  /**
   * El otro control que nadie protege.
   *
   * `reverse()` construye la anulación invirtiendo los importes del original,
   * pero nada impide escribir una transacción con `reverses_id` puesto y unos
   * asientos que no tienen nada que ver. El índice único garantiza que sólo hay
   * una anulación por transacción; no garantiza que anule.
   *
   * Si la anulación es correcta, sumar sus asientos con los del original da
   * cero **en cada cuenta**.
   */
  private async reversalsThatDoNotReverse(): Promise<Finding | null> {
    const rows = await this.prisma.$queryRaw<FindingRow[]>`
      SELECT
        reversal.id::text AS example,
        COUNT(*) OVER ()::int AS total
      FROM transactions reversal
      WHERE reversal.reverses_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM entries e
          WHERE e.transaction_id IN (reversal.id, reversal.reverses_id)
          GROUP BY e.account_id
          HAVING SUM(e.amount) <> 0
        )
      LIMIT ${SAMPLE_SIZE}
    `;

    return toFinding(
      rows,
      "reversals-that-do-not-reverse",
      "critical",
      "Hay anulaciones que no dejan las cuentas como estaban",
    );
  }

  /** La clave foránea lo impide. Se mira igual, que es de lo que va esto. */
  private async orphanEntries(): Promise<Finding | null> {
    const rows = await this.prisma.$queryRaw<FindingRow[]>`
      SELECT
        e.id::text AS example,
        COUNT(*) OVER ()::int AS total
      FROM entries e
      LEFT JOIN accounts a ON a.id = e.account_id
      WHERE a.id IS NULL
      LIMIT ${SAMPLE_SIZE}
    `;

    return toFinding(
      rows,
      "orphan-entries",
      "critical",
      "Hay asientos que apuntan a una cuenta que no existe",
    );
  }
}

/**
 * Convierte las filas en un hallazgo, o en nada si no hubo ninguna.
 *
 * El total viaja en cada fila gracias a `COUNT(*) OVER ()`, que se calcula
 * antes del `LIMIT`. Así una sola consulta da el recuento completo y unos pocos
 * ejemplos, en vez de dos consultas que además podrían ver estados distintos.
 */
function toFinding(
  rows: FindingRow[],
  check: string,
  severity: Severity,
  summary: string,
): Finding | null {
  const total = rows[0]?.total ?? 0;
  if (total === 0) return null;

  return { check, severity, summary, count: total, sample: rows.map((row) => row.example) };
}
