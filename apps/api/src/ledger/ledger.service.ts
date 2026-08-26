import { Injectable } from "@nestjs/common";

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

/** Los asientos se devuelven con los cargos primero, como en un extracto. */
const ORDEN_DE_ASIENTOS = { amount: "asc" } as const;

/** Sentencia fija, sin nada del usuario dentro. Ver `write` para el porqué. */
const ADELANTAR_COMPROBACIONES = "SET CONSTRAINTS ALL IMMEDIATE";

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
 * caso de uso que las aplica. La regla llega en la fase 2, junto con el bloqueo
 * que la hace correcta bajo concurrencia: comprobar el saldo y escribir sin
 * bloquear la fila es justo el error que la fase 2 existe para demostrar, así
 * que no se escribe aquí a medias.
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
    await this.assertAccountsExist(draft.entries);

    if (draft.idempotencyKey !== undefined) {
      const previa = await this.findByIdempotencyKey(draft.idempotencyKey);
      if (previa) return this.assertSamePayload(previa, draft);
    }

    return this.write(draft, null);
  }

  /**
   * El saldo de una cuenta, sumando sus asientos.
   *
   * Son dos consultas y no una a propósito: sin comprobar que la cuenta existe,
   * pedir el saldo de un id inventado devolvería cero, que es indistinguible de
   * una cuenta recién abierta. En un libro contable eso no es un detalle.
   */
  async balanceOf(accountId: string): Promise<bigint> {
    if (!isUuid(accountId)) throw new UnknownAccountError(accountId);

    const cuenta = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true },
    });
    if (!cuenta) throw new UnknownAccountError(accountId);

    const { _sum } = await this.prisma.entry.aggregate({
      _sum: { amount: true },
      where: { accountId },
    });

    return _sum.amount ?? 0n;
  }

  async byId(transactionId: string): Promise<PostedTransaction | null> {
    if (!isUuid(transactionId)) return null;

    const fila = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { entries: { orderBy: ORDEN_DE_ASIENTOS } },
    });

    return fila ? toPosted(fila) : null;
  }

  /**
   * Anula una transacción con otra que invierte sus importes.
   *
   * No hay `UPDATE` ni `DELETE` sobre los asientos: la base los rechaza. Un
   * error se corrige dejándolo escrito y escribiendo su contrario al lado, de
   * modo que el histórico cuenta lo que pasó de verdad, incluido el error.
   */
  async reverse(transactionId: string, description?: string): Promise<PostedTransaction> {
    const original = await this.byId(transactionId);
    if (!original) throw new TransactionNotFoundError(transactionId);

    // Camino rápido para dar un error claro. La garantía de que no se anula dos
    // veces es el índice único sobre `reverses_id`, que se comprueba al
    // escribir: entre esta consulta y la escritura cabe otra petición.
    const anulacion = await this.prisma.transaction.findUnique({
      where: { reversesId: transactionId },
      select: { id: true },
    });
    if (anulacion) throw new AlreadyReversedError(transactionId);

    return this.write(
      {
        description: description ?? `Anulación de «${original.description}»`,
        entries: original.entries.map((asiento) => ({
          accountId: asiento.accountId,
          amount: -asiento.amount,
        })),
      },
      transactionId,
    );
  }

  // ─── interior ──────────────────────────────────────────────────────────────

  /**
   * La única escritura del motor.
   *
   * La transacción y sus asientos se escriben juntos, en una sola transacción
   * de base de datos. Eso es lo que hace funcionar al trigger diferido: la
   * comprobación de que los asientos suman cero se aplaza hasta el final,
   * cuando ya están todos. Si fueran escrituras sueltas, la primera fallaría
   * siempre — al insertar el primer asiento la suma todavía no es cero.
   *
   * El `SET CONSTRAINTS ALL IMMEDIATE` del final no es un adorno. Si se deja
   * que la comprobación salte en el `COMMIT`, **Prisma pierde el motivo**:
   * Postgres cierra la transacción al rechazar el commit, Prisma intenta un
   * `ROLLBACK` sobre algo ya cerrado y reporta ese fallo secundario
   * («Transaction already closed») en lugar de la violación real. El error que
   * llegaría al dominio no diría nada.
   *
   * Adelantar la comprobación al final de nuestra unidad de trabajo la
   * convierte en un error de sentencia normal, con su SQLSTATE y con el
   * mensaje que escribe el trigger. La restricción sigue siendo diferida; lo
   * único que cambia es que cerramos la ventana nosotros en vez de esperar al
   * `COMMIT`.
   */
  private async write(
    draft: TransactionDraft,
    reversesId: string | null,
  ): Promise<PostedTransaction> {
    try {
      const fila = await this.prisma.$transaction(async (tx) => {
        const creada = await tx.transaction.create({
          data: {
            description: draft.description,
            idempotencyKey: draft.idempotencyKey ?? null,
            reversesId,
            entries: {
              createMany: {
                data: draft.entries.map((asiento) => ({
                  accountId: asiento.accountId,
                  amount: asiento.amount,
                })),
              },
            },
          },
          include: { entries: { orderBy: ORDEN_DE_ASIENTOS } },
        });

        await tx.$executeRawUnsafe(ADELANTAR_COMPROBACIONES);

        return creada;
      });

      return toPosted(fila);
    } catch (error) {
      return await this.explain(error, draft, reversesId);
    }
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
      const ganadora = await this.findByIdempotencyKey(draft.idempotencyKey);
      if (ganadora) return this.assertSamePayload(ganadora, draft);
    }

    if (reversesId !== null && isUniqueViolationOn(error, "reverses_id")) {
      throw new AlreadyReversedError(reversesId);
    }

    const fallo = readPostgresFailure(error);
    if (fallo) throw new LedgerInvariantViolatedError(fallo.message);

    throw error;
  }

  /** Las tres reglas de forma, comprobadas sin tocar la base. */
  private assertDraftIsSound(draft: TransactionDraft): void {
    if (draft.entries.length < 2) {
      throw new InsufficientEntriesError(draft.entries.length);
    }

    const enCero = draft.entries.find((asiento) => asiento.amount === 0n);
    if (enCero) throw new ZeroAmountError(enCero.accountId);

    const descuadre = draft.entries.reduce((suma, asiento) => suma + asiento.amount, 0n);
    if (descuadre !== 0n) throw new UnbalancedTransactionError(descuadre);
  }

  private async assertAccountsExist(entries: EntryDraft[]): Promise<void> {
    const ids = [...new Set(entries.map((asiento) => asiento.accountId))];

    const malFormado = ids.find((id) => !isUuid(id));
    if (malFormado !== undefined) throw new UnknownAccountError(malFormado);

    const existentes = await this.prisma.account.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (existentes.length === ids.length) return;

    const encontradas = new Set(existentes.map((cuenta) => cuenta.id));
    throw new UnknownAccountError(ids.find((id) => !encontradas.has(id)) ?? ids.join(", "));
  }

  private async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<PostedTransaction | null> {
    const fila = await this.prisma.transaction.findUnique({
      where: { idempotencyKey },
      include: { entries: { orderBy: ORDEN_DE_ASIENTOS } },
    });

    return fila ? toPosted(fila) : null;
  }

  /**
   * Reintentar con la misma clave tiene que pedir lo mismo.
   *
   * Devolver la transacción original ante un contenido distinto sería mentir:
   * el cliente pidió otra cosa y se iría creyendo que se hizo. Crear una nueva
   * rompería la promesa de la clave. Sólo queda el error.
   */
  private assertSamePayload(
    previa: PostedTransaction,
    draft: TransactionDraft,
  ): PostedTransaction {
    const igual =
      previa.description === draft.description &&
      previa.entries.length === draft.entries.length &&
      huella(previa.entries) === huella(draft.entries);

    if (!igual) throw new IdempotencyKeyReusedError(draft.idempotencyKey ?? "");

    return previa;
  }
}

function toPosted(fila: TransactionRow): PostedTransaction {
  return {
    id: fila.id,
    description: fila.description,
    idempotencyKey: fila.idempotencyKey,
    reversesId: fila.reversesId,
    createdAt: fila.createdAt,
    entries: fila.entries.map((asiento) => ({
      id: asiento.id,
      accountId: asiento.accountId,
      amount: asiento.amount,
    })),
  };
}

/** Identidad de un conjunto de asientos, sin depender del orden en que lleguen. */
function huella(entries: { accountId: string; amount: bigint }[]): string {
  return entries
    .map((asiento) => `${asiento.accountId}:${asiento.amount}`)
    .sort()
    .join("|");
}
