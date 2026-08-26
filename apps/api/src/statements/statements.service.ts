import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { UnknownAccountError } from "../ledger/ledger.errors";
import { PrismaService } from "../prisma/prisma.service";
import { isUuid } from "../shared/uuid";
import type { StatementCursor } from "./cursor";
import { decodeCursor, encodeCursor } from "./cursor";
import { InvalidPageSizeError } from "./statements.errors";
import type { StatementLine, StatementPage, StatementQuery } from "./statements.types";

const TAMANO_POR_DEFECTO = 50;
const TAMANO_MAXIMO = 100;

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

    const tamano = acotarTamano(query.limit);
    const desde = query.cursor === undefined ? null : decodeCursor(query.cursor);

    // Se pide una fila de más. Si llega, hay siguiente página — y así se evita
    // el `COUNT(*)` que casi todas las paginaciones hacen sin necesitarlo, que
    // en una tabla grande cuesta más que la propia página.
    const filas = await this.prisma.entry.findMany({
      where: { accountId, ...anteriorA(desde) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: tamano + 1,
      select: {
        id: true,
        transactionId: true,
        amount: true,
        createdAt: true,
        transaction: { select: { description: true, reversesId: true } },
      },
    });

    const hayMas = filas.length > tamano;
    const pagina = hayMas ? filas.slice(0, tamano) : filas;

    const primera = pagina[0];
    if (primera === undefined) return { lines: [], nextCursor: null };

    return {
      lines: await this.aLineas(accountId, pagina, primera),
      nextCursor: hayMas ? cursorDeLaUltima(pagina) : null,
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
  private async aLineas(
    accountId: string,
    pagina: EntryRow[],
    primera: EntryRow,
  ): Promise<StatementLine[]> {
    let saldo = await this.balanceUpTo(accountId, primera);

    return pagina.map((fila) => {
      const linea: StatementLine = {
        entryId: fila.id,
        transactionId: fila.transactionId,
        description: fila.transaction.description,
        amount: fila.amount,
        balance: saldo,
        isReversal: fila.transaction.reversesId !== null,
        createdAt: fila.createdAt,
      };

      saldo -= fila.amount;

      return linea;
    });
  }

  /** El saldo contando este asiento y todos los anteriores. */
  private async balanceUpTo(accountId: string, hasta: StatementCursor): Promise<bigint> {
    const { _sum } = await this.prisma.entry.aggregate({
      _sum: { amount: true },
      where: {
        accountId,
        OR: [
          { createdAt: { lt: hasta.createdAt } },
          { createdAt: hasta.createdAt, id: { lte: hasta.id } },
        ],
      },
    });

    return _sum.amount ?? 0n;
  }

  private async assertAccountExists(accountId: string): Promise<void> {
    if (!isUuid(accountId)) throw new UnknownAccountError(accountId);

    const cuenta = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true },
    });
    if (!cuenta) throw new UnknownAccountError(accountId);
  }
}

/**
 * «Lo que va antes de este punto», en el orden del extracto.
 *
 * Postgres compara tuplas — `(created_at, id) < ($1, $2)` — pero Prisma no sabe
 * expresarlo, así que hay que desdoblarlo: o la fecha es menor, o es la misma y
 * el id es menor. Es literalmente la misma condición escrita a mano.
 */
function anteriorA(desde: StatementCursor | null): Prisma.EntryWhereInput {
  if (desde === null) return {};

  return {
    OR: [
      { createdAt: { lt: desde.createdAt } },
      { createdAt: desde.createdAt, id: { lt: desde.id } },
    ],
  };
}

function cursorDeLaUltima(pagina: EntryRow[]): string | null {
  const ultima = pagina[pagina.length - 1];

  return ultima === undefined
    ? null
    : encodeCursor({ createdAt: ultima.createdAt, id: ultima.id });
}

/**
 * Un tamaño de página demasiado grande se recorta; uno imposible es un error.
 *
 * La asimetría es intencionada. Pedir mil líneas es decir «dame todo lo que
 * puedas», y devolver cien responde a esa intención. Pedir cero o media línea
 * no es una intención: es un fallo de quien llama, y recortarlo en silencio lo
 * escondería.
 */
function acotarTamano(limit: number | undefined): number {
  if (limit === undefined) return TAMANO_POR_DEFECTO;
  if (!Number.isInteger(limit) || limit < 1) throw new InvalidPageSizeError(limit);

  return Math.min(limit, TAMANO_MAXIMO);
}
