import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { UnknownAccountError } from "../ledger/ledger.errors";
import { PrismaService } from "../prisma/prisma.service";
import { isUuid } from "../shared/uuid";
import type { StatementCursor } from "./cursor";
import { decodeCursor, encodeCursor } from "./cursor";
import { InvalidPageSizeError } from "./statements.errors";
import type { StatementLine, StatementPage, StatementQuery } from "./statements.types";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/** Lo que hace falta de cada asiento para montar una línea. */
interface EntryRow {
  id: string;
  transactionId: string;
  amount: bigint;
  createdAt: Date;
  transaction: { description: string; reversesId: string | null };
}

/**
 * El extracto de una cuenta.
 *
 * Es un **modelo de lectura**: no escribe nada y no conoce al motor de asientos
 * ni a las transferencias. Sólo sabe leer lo que dejaron escrito.
 *
 * ## Por qué cursor y no `OFFSET`
 *
 * `LIMIT 20 OFFSET 40` tiene dos problemas, y el segundo es el grave.
 *
 * El conocido: Postgres tiene que recorrer y descartar las 40 primeras filas
 * para devolver las 20 siguientes. En la página 500 eso son 10.000 filas leídas
 * para tirarlas.
 *
 * El que muerde: **el `OFFSET` se mide sobre un resultado que se mueve**. Si
 * entre la página 1 y la página 2 llega un movimiento nuevo, todo se desplaza
 * una posición y el último de la página 1 vuelve a salir el primero en la 2. En
 * una lista de artículos es un incordio; en un extracto bancario es un
 * movimiento duplicado ante los ojos de quien lo lee. Y al revés, si algo sale
 * del principio, un movimiento **desaparece** sin que nadie se entere.
 *
 * Un cursor apunta a una fila concreta: «lo que venga después de ésta». Lo que
 * pase por delante no le afecta.
 */
@Injectable()
export class StatementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Una página del extracto, del movimiento más reciente al más antiguo.
   *
   * Cada línea lleva el saldo de la cuenta **después** de ese asiento, que es
   * como se lee un extracto: la primera línea muestra el saldo actual y bajando
   * se recorre la historia hacia atrás.
   */
  async statement(accountId: string, query: StatementQuery = {}): Promise<StatementPage> {
    await this.assertAccountExists(accountId);

    const size = clampPageSize(query.limit);
    const from = query.cursor === undefined ? null : decodeCursor(query.cursor);

    // Se pide una fila de más. Si llega, hay siguiente página — y así se evita
    // el `COUNT(*)` que casi todas las paginaciones hacen sin necesitarlo, que
    // en una tabla grande cuesta más que la propia página.
    const rows = await this.prisma.entry.findMany({
      where: { accountId, ...before(from) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: size + 1,
      select: {
        id: true,
        transactionId: true,
        amount: true,
        createdAt: true,
        transaction: { select: { description: true, reversesId: true } },
      },
    });

    const hasMore = rows.length > size;
    const page = hasMore ? rows.slice(0, size) : rows;

    const first = page[0];
    if (first === undefined) return { lines: [], nextCursor: null };

    return {
      lines: await this.toLines(accountId, page, first),
      nextCursor: hasMore ? cursorOfLast(page) : null,
    };
  }

  /**
   * El saldo de la cuenta tal y como estaba en un momento dado.
   *
   * Es la misma suma de siempre, recortada por fecha. Sigue siendo O(n) sobre
   * los asientos de la cuenta: la respuesta cuando eso pese no es guardar un
   * campo `balance` — el dato duplicado que este proyecto existe para evitar —
   * sino instantáneas periódicas por cuenta, de modo que la suma arranque en la
   * más cercana anterior a la fecha pedida en vez de en el principio de los
   * tiempos. Mientras no haya volumen que lo justifique, esto es lo correcto.
   */
  async balanceAt(accountId: string, at: Date): Promise<bigint> {
    await this.assertAccountExists(accountId);

    const { _sum } = await this.prisma.entry.aggregate({
      _sum: { amount: true },
      where: { accountId, createdAt: { lte: at } },
    });

    return _sum.amount ?? 0n;
  }

  // ─── interior ──────────────────────────────────────────────────────────────

  /**
   * Pone el saldo corriente a cada línea con **una sola** consulta.
   *
   * La tentación es pedir el saldo de cada línea por separado, y eso es una
   * consulta por fila. Como la página va de más nuevo a más viejo, basta con
   * saber el saldo de la primera — que incluye todo lo anterior — e ir restando
   * hacia abajo: el saldo antes de un asiento es el de después menos su importe.
   */
  private async toLines(
    accountId: string,
    page: EntryRow[],
    first: EntryRow,
  ): Promise<StatementLine[]> {
    let balance = await this.balanceUpTo(accountId, first);

    return page.map((row) => {
      const line: StatementLine = {
        entryId: row.id,
        transactionId: row.transactionId,
        description: row.transaction.description,
        amount: row.amount,
        balance: balance,
        isReversal: row.transaction.reversesId !== null,
        createdAt: row.createdAt,
      };

      balance -= row.amount;

      return line;
    });
  }

  /** El saldo contando este asiento y todos los anteriores. */
  private async balanceUpTo(accountId: string, upTo: StatementCursor): Promise<bigint> {
    const { _sum } = await this.prisma.entry.aggregate({
      _sum: { amount: true },
      where: {
        accountId,
        OR: [
          { createdAt: { lt: upTo.createdAt } },
          { createdAt: upTo.createdAt, id: { lte: upTo.id } },
        ],
      },
    });

    return _sum.amount ?? 0n;
  }

  private async assertAccountExists(accountId: string): Promise<void> {
    if (!isUuid(accountId)) throw new UnknownAccountError(accountId);

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true },
    });
    if (!account) throw new UnknownAccountError(accountId);
  }
}

/**
 * «Lo que va antes de este punto», en el orden del extracto.
 *
 * Postgres compara tuplas — `(created_at, id) < ($1, $2)` — pero Prisma no sabe
 * expresarlo, así que hay que desdoblarlo: o la fecha es menor, o es la misma y
 * el id es menor. Es literalmente la misma condición escrita a mano.
 */
function before(from: StatementCursor | null): Prisma.EntryWhereInput {
  if (from === null) return {};

  return {
    OR: [
      { createdAt: { lt: from.createdAt } },
      { createdAt: from.createdAt, id: { lt: from.id } },
    ],
  };
}

function cursorOfLast(page: EntryRow[]): string | null {
  const last = page[page.length - 1];

  return last === undefined ? null : encodeCursor({ createdAt: last.createdAt, id: last.id });
}

/**
 * Un tamaño de página demasiado grande se recorta; uno imposible es un error.
 *
 * La asimetría es intencionada. Pedir mil líneas es decir «dame todo lo que
 * puedas», y devolver cien responde a esa intención. Pedir cero o media línea
 * no es una intención: es un fallo de quien llama, y recortarlo en silencio lo
 * escondería.
 */
function clampPageSize(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1) throw new InvalidPageSizeError(limit);

  return Math.min(limit, MAX_PAGE_SIZE);
}
