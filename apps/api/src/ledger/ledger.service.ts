import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { isUniqueViolationOn, readPostgresFailure } from "../prisma/postgres-errors";
import { PrismaService } from "../prisma/prisma.service";
import { isUuid } from "../shared/uuid";
import {
  AlreadyReversedError,
  IdempotencyKeyReusedError,
  InsufficientEntriesError,
  LedgerInvariantViolatedError,
  TransactionNotFoundError,
  UnbalancedTransactionError,
  UnknownAccountError,
  ZeroAmountError,
} from "./ledger.errors";
import type { EntryDraft, PostedTransaction, TransactionDraft } from "./ledger.types";

/**
 * Quien ejecuta las consultas: el cliente normal o el de una transacción que ya
 * abrió otro.
 *
 * Es lo que permite que una transferencia bloquee las cuentas y escriba los
 * asientos dentro de **la misma** transacción de base de datos. Si fueran dos
 * transacciones distintas, el bloqueo se soltaría antes de escribir y no
 * serviría de nada.
 */
export type LedgerExecutor = Prisma.TransactionClient;

/** Los asientos se devuelven con los cargos primero, como en un extracto. */
const ENTRY_ORDER = { amount: "asc" } as const;

/** Sentencias fijas, sin nada del usuario dentro. Ver `insert` para el porqué. */
const CHECK_CONSTRAINTS_NOW = "SET CONSTRAINTS ALL IMMEDIATE";
const DEFER_CONSTRAINTS_AGAIN = "SET CONSTRAINTS ALL DEFERRED";

/** Forma mínima de lo que devuelve Prisma; evita atarse a sus tipos generados. */
interface TransactionRow {
  id: string;
  description: string;
  idempotencyKey: string | null;
  reversesId: string | null;
  createdAt: Date;
  entries: { id: string; accountId: string; amount: bigint }[];
}

/**
 * El motor de asientos.
 *
 * Registra movimientos y deriva saldos. Nada más — y ese «nada más» es
 * deliberado en dos frentes:
 *
 * **No decide si un movimiento está permitido.** El motor no comprueba si una
 * cuenta se queda en descubierto. Un libro contable registra lo que pasó; que
 * un movimiento deba permitirse es una política, y las políticas viven en el
 * caso de uso que las aplica — `TransfersService` es quien la aplica, y lo hace
 * con la cuenta bloqueada.
 *
 * **No guarda saldos.** `balanceOf` los suma cada vez. Es O(n) sobre los
 * asientos de la cuenta y con el tiempo se nota; la respuesta no es un campo
 * `balance` — ese es el dato duplicado que este proyecto existe para evitar —
 * sino instantáneas periódicas, cuando haya volumen que lo justifique.
 *
 * Las validaciones de aquí **no son la garantía**: la garantía son los triggers
 * de la migración. Éstas existen para dar un error claro y en el idioma del
 * dominio antes de molestar a la base.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra un movimiento: dos o más asientos que suman cero, todos juntos.
   *
   * Con `idempotencyKey`, repetir la llamada devuelve la transacción original
   * en vez de crear otra.
   */
  async post(draft: TransactionDraft): Promise<PostedTransaction> {
    this.assertDraftIsSound(draft);
    await this.assertAccountsExist(this.prisma, draft.entries);

    if (draft.idempotencyKey !== undefined) {
      const existing = await this.byIdempotencyKey(draft.idempotencyKey);
      if (existing) return this.assertSamePayload(existing, draft);
    }

    return this.write(draft, null);
  }

  /**
   * Como `post`, pero dentro de una transacción que abrió otro.
   *
   * La diferencia no es cosmética: aquí **no se puede recuperar de un fallo**.
   * En Postgres, una sentencia que falla aborta la transacción entera, y a
   * partir de ese punto cualquier consulta responde «current transaction is
   * aborted». Atrapar el error aquí y seguir no funcionaría; quien abrió la
   * transacción es quien tiene que dejarla caer y decidir qué hacer fuera.
   */
  async postWithin(tx: LedgerExecutor, draft: TransactionDraft): Promise<PostedTransaction> {
    this.assertDraftIsSound(draft);
    await this.assertAccountsExist(tx, draft.entries);

    return toPosted(await this.insert(tx, draft, null));
  }

  /**
   * El saldo de una cuenta, sumando sus asientos.
   *
   * Son dos consultas y no una a propósito: sin comprobar que la cuenta existe,
   * pedir el saldo de un id inventado devolvería cero, que es indistinguible de
   * una cuenta recién abierta. En un libro contable eso no es un detalle.
   */
  async balanceOf(accountId: string): Promise<bigint> {
    return this.balanceOfWithin(this.prisma, accountId);
  }

  /**
   * El saldo dentro de una transacción abierta.
   *
   * Es el que usa una transferencia después de bloquear la cuenta: leer el
   * saldo fuera del bloqueo daría un número que puede haber cambiado para
   * cuando se escriba.
   */
  async balanceOfWithin(tx: LedgerExecutor, accountId: string): Promise<bigint> {
    if (!isUuid(accountId)) throw new UnknownAccountError(accountId);

    const account = await tx.account.findUnique({
      where: { id: accountId },
      select: { id: true },
    });
    if (!account) throw new UnknownAccountError(accountId);

    const { _sum } = await tx.entry.aggregate({ _sum: { amount: true }, where: { accountId } });

    return _sum.amount ?? 0n;
  }

  async byId(transactionId: string): Promise<PostedTransaction | null> {
    if (!isUuid(transactionId)) return null;

    const row = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { entries: { orderBy: ENTRY_ORDER } },
    });

    return row ? toPosted(row) : null;
  }

  async byIdempotencyKey(idempotencyKey: string): Promise<PostedTransaction | null> {
    const row = await this.prisma.transaction.findUnique({
      where: { idempotencyKey },
      include: { entries: { orderBy: ENTRY_ORDER } },
    });

    return row ? toPosted(row) : null;
  }

  /**
   * Anula una transacción con otra que invierte sus importes.
   *
   * No hay `UPDATE` ni `DELETE` sobre los asientos: la base los rechaza. Un
   * error se corrige dejándolo escrito y escribiendo su contrario al lado, de
   * modo que el histórico cuenta lo que pasó de verdad, incluido el error.
   */
  async reverse(transactionId: string, description?: string): Promise<PostedTransaction> {
    const draft = await this.draftReversal(this.prisma, transactionId, description);

    return this.write(draft, transactionId);
  }

  /**
   * Como `reverse`, pero dentro de una transacción que abrió otro.
   *
   * Existe por la misma razón que `postWithin`, y por una más grave: **el libro
   * no comprueba fondos**. Esa guarda vive en quien mueve dinero, porque es
   * quien sabe que una cuenta de sistema puede estar en negativo y una de
   * verdad no. Anular un cobro devuelve dinero, o sea que lo saca de donde
   * entró, y si eso se hace sin bloquear la cuenta y mirar el saldo dentro de
   * la misma transacción, un ingreso ya gastado deja la cuenta en descubierto.
   *
   * Sin esto no había forma de anular con esa guarda puesta: `reverse` abre su
   * propia transacción y para cuando escribe ya es tarde para negarse.
   */
  async reverseWithin(
    tx: LedgerExecutor,
    transactionId: string,
    description?: string,
  ): Promise<PostedTransaction> {
    const draft = await this.draftReversal(tx, transactionId, description);

    return toPosted(await this.insert(tx, draft, transactionId));
  }

  /**
   * La transacción contraria: los mismos asientos con el signo cambiado.
   *
   * La comprobación de «ya está anulada» es un camino rápido para dar un error
   * claro, no la garantía. La garantía es el índice único sobre `reverses_id`,
   * que se comprueba al escribir: entre esta consulta y la escritura cabe otra
   * petición.
   */
  private async draftReversal(
    executor: LedgerExecutor,
    transactionId: string,
    description?: string,
  ): Promise<TransactionDraft> {
    const original = await this.byId(transactionId);
    if (!original) throw new TransactionNotFoundError(transactionId);

    const reversal = await executor.transaction.findUnique({
      where: { reversesId: transactionId },
      select: { id: true },
    });
    if (reversal) throw new AlreadyReversedError(transactionId);

    return {
      description: description ?? `Anulación de «${original.description}»`,
      entries: original.entries.map((entry) => ({
        accountId: entry.accountId,
        amount: -entry.amount,
      })),
    };
  }

  /**
   * Reintentar con la misma clave tiene que pedir lo mismo.
   *
   * Devolver la transacción original ante un contenido distinto sería mentir:
   * el cliente pidió otra cosa y se iría creyendo que se hizo. Crear una nueva
   * rompería la promesa de la clave. Sólo queda el error.
   *
   * Es público porque quien escribe dentro de su propia transacción — una
   * transferencia, por ejemplo — tiene que resolver la misma carrera fuera de
   * ella, y no debe reimplementar esta comparación.
   */
  assertSamePayload(existing: PostedTransaction, draft: TransactionDraft): PostedTransaction {
    const sameRequest =
      existing.description === draft.description &&
      existing.entries.length === draft.entries.length &&
      fingerprint(existing.entries) === fingerprint(draft.entries);

    if (!sameRequest) throw new IdempotencyKeyReusedError(draft.idempotencyKey ?? "");

    return existing;
  }

  // ─── interior ──────────────────────────────────────────────────────────────

  /** Abre una transacción propia y traduce lo que salga mal. */
  private async write(
    draft: TransactionDraft,
    reversesId: string | null,
  ): Promise<PostedTransaction> {
    try {
      const row = await this.prisma.$transaction((tx) => this.insert(tx, draft, reversesId));

      return toPosted(row);
    } catch (error) {
      return await this.explain(error, draft, reversesId);
    }
  }

  /**
   * La escritura, sin transacción propia.
   *
   * La transacción y sus asientos se escriben juntos: eso es lo que hace
   * funcionar al trigger diferido, porque la comprobación de que los asientos
   * suman cero se aplaza hasta el final, cuando ya están todos. Si fueran
   * escrituras sueltas, la primera fallaría siempre — al insertar el primer
   * asiento la suma todavía no es cero.
   *
   * El `SET CONSTRAINTS ALL IMMEDIATE` no es un adorno. Si se deja que la
   * comprobación salte en el `COMMIT`, **Prisma pierde el motivo**: Postgres
   * cierra la transacción al rechazar el commit, Prisma intenta un `ROLLBACK`
   * sobre algo ya cerrado y reporta ese fallo secundario («Transaction already
   * closed») en lugar de la violación real. El error que llegaría al dominio no
   * diría nada.
   *
   * Y el `ALL DEFERRED` de después devuelve la transacción a como estaba. El
   * modo dura hasta el final de la transacción, así que sin restaurarlo un
   * segundo movimiento escrito en la misma transacción fallaría al insertar su
   * primer asiento — que es justo lo que la restricción diferida evita.
   */
  private async insert(
    tx: LedgerExecutor,
    draft: TransactionDraft,
    reversesId: string | null,
  ): Promise<TransactionRow> {
    const created = await tx.transaction.create({
      data: {
        description: draft.description,
        idempotencyKey: draft.idempotencyKey ?? null,
        reversesId,
        entries: {
          createMany: {
            data: draft.entries.map((entry) => ({
              accountId: entry.accountId,
              amount: entry.amount,
            })),
          },
        },
      },
      include: { entries: { orderBy: ENTRY_ORDER } },
    });

    await tx.$executeRawUnsafe(CHECK_CONSTRAINTS_NOW);
    await tx.$executeRawUnsafe(DEFER_CONSTRAINTS_AGAIN);

    return created;
  }

  /**
   * Convierte el rechazo de la base en algo que el dominio entienda.
   *
   * Devuelve en vez de lanzar en un caso: dos peticiones simultáneas con la
   * misma clave de idempotencia. Una gana y la otra choca contra el índice
   * único; lo correcto entonces no es fallar, sino devolver lo que escribió la
   * que ganó. Por eso el chequeo previo de `post` no basta y este `catch`
   * tampoco sobra — el primero es el camino rápido, éste es el correcto.
   */
  private async explain(
    error: unknown,
    draft: TransactionDraft,
    reversesId: string | null,
  ): Promise<PostedTransaction> {
    if (draft.idempotencyKey !== undefined && isUniqueViolationOn(error, "idempotency_key")) {
      const winner = await this.byIdempotencyKey(draft.idempotencyKey);
      if (winner) return this.assertSamePayload(winner, draft);
    }

    if (reversesId !== null && isUniqueViolationOn(error, "reverses_id")) {
      throw new AlreadyReversedError(reversesId);
    }

    const failure = readPostgresFailure(error);
    if (failure) throw new LedgerInvariantViolatedError(failure.message);

    throw error;
  }

  /** Las tres reglas de forma, comprobadas sin tocar la base. */
  private assertDraftIsSound(draft: TransactionDraft): void {
    if (draft.entries.length < 2) {
      throw new InsufficientEntriesError(draft.entries.length);
    }

    const zeroed = draft.entries.find((entry) => entry.amount === 0n);
    if (zeroed) throw new ZeroAmountError(zeroed.accountId);

    const imbalance = draft.entries.reduce((sum, entry) => sum + entry.amount, 0n);
    if (imbalance !== 0n) throw new UnbalancedTransactionError(imbalance);
  }

  private async assertAccountsExist(tx: LedgerExecutor, entries: EntryDraft[]): Promise<void> {
    const ids = [...new Set(entries.map((entry) => entry.accountId))];

    const malformed = ids.find((id) => !isUuid(id));
    if (malformed !== undefined) throw new UnknownAccountError(malformed);

    const existing = await tx.account.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (existing.length === ids.length) return;

    const found = new Set(existing.map((account) => account.id));
    throw new UnknownAccountError(ids.find((id) => !found.has(id)) ?? ids.join(", "));
  }
}

function toPosted(row: TransactionRow): PostedTransaction {
  return {
    id: row.id,
    description: row.description,
    idempotencyKey: row.idempotencyKey,
    reversesId: row.reversesId,
    createdAt: row.createdAt,
    entries: row.entries.map((entry) => ({
      id: entry.id,
      accountId: entry.accountId,
      amount: entry.amount,
    })),
  };
}

/** Identidad de un conjunto de asientos, sin depender del orden en que lleguen. */
function fingerprint(entries: { accountId: string; amount: bigint }[]): string {
  return entries
    .map((entry) => `${entry.accountId}:${entry.amount}`)
    .sort()
    .join("|");
}
