import { Injectable } from "@nestjs/common";

import { TransactionNotFoundError, UnknownAccountError } from "../ledger/ledger.errors";
import type { LedgerExecutor } from "../ledger/ledger.service";
import { LedgerService } from "../ledger/ledger.service";
import type { PostedTransaction, TransactionDraft } from "../ledger/ledger.types";
import { isUniqueViolationOn } from "../prisma/postgres-errors";
import { PrismaService } from "../prisma/prisma.service";
import { formatUsd } from "../shared/money";
import {
  InsufficientFundsError,
  NonPositiveAmountError,
  NotYourTransactionError,
  SameAccountTransferError,
} from "./transfers.errors";
import type { ReversalOrder, TransferOrder } from "./transfers.types";

/**
 * Cuánto está dispuesta a esperar una transferencia.
 *
 * Las que tocan la misma cuenta se serializan por el bloqueo, así que en una
 * ráfaga la última espera a todas las anteriores. Los valores por defecto de
 * Prisma — 2 s para conseguir conexión, 5 s de transacción — se quedan cortos en
 * cuanto hay contención de verdad, y el fallo que dan no se distingue de un
 * error real.
 */
const WAIT_LIMITS = { maxWait: 10_000, timeout: 20_000 } as const;

/**
 * Mover dinero entre cuentas.
 *
 * Aquí vive la política que el motor de asientos deliberadamente no tiene: una
 * cuenta de persona no puede quedar en descubierto. Y vive aquí porque aplicarla
 * bien exige algo que el motor no debe saber — **bloquear la cuenta**.
 *
 * ## Por qué hace falta el bloqueo
 *
 * Comprobar el saldo y después escribir es correcto sólo si nadie escribe en
 * medio. Con dos transferencias a la vez sobre una cuenta de $100:
 *
 * ```
 *   A: lee saldo → $100 · $10 cabe ✓
 *   B: lee saldo → $100 · $10 cabe ✓        ← lee lo mismo, A aún no escribió
 *   A: escribe -$10
 *   B: escribe -$10
 * ```
 *
 * Las dos vieron un saldo verdadero y las dos decidieron bien, y aun así el
 * resultado está mal. Con cincuenta a la vez sobre $100 pasarían las cincuenta y
 * la cuenta acabaría en -$400.
 *
 * ## Cómo se resuelve
 *
 * `SELECT … FOR UPDATE` sobre la fila de la cuenta antes de leer el saldo. La
 * fila no guarda ningún saldo: se bloquea **por su identidad**, como quien coge
 * una llave. Quien la tiene lee y escribe sin que nadie se cuele; los demás
 * esperan y vuelven a leer, ya con lo que escribió el anterior.
 *
 * El bloqueo y la escritura van en la **misma** transacción de base de datos. Si
 * fueran dos, se soltaría antes de escribir y no serviría de nada — por eso el
 * motor expone `postWithin`.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Mueve dinero de una cuenta a otra.
   *
   * Un ingreso desde fuera es esta misma operación con una cuenta de sistema
   * como origen: no hace falta un método aparte, porque lo que cambia no es la
   * mecánica sino de dónde sale el dinero.
   */
  async transfer(order: TransferOrder): Promise<PostedTransaction> {
    const draft = toDraft(order);

    // Camino rápido: si la clave ya se usó no hay nada que bloquear ni que
    // escribir. Ahorra la transacción entera en el caso normal de un reintento.
    if (draft.idempotencyKey !== undefined) {
      const existing = await this.ledger.byIdempotencyKey(draft.idempotencyKey);
      if (existing) return this.ledger.assertSamePayload(existing, draft);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockAccounts(tx, [order.fromAccountId, order.toAccountId]);
        await this.assertSufficientFunds(tx, order.fromAccountId, order.amount);

        return this.ledger.postWithin(tx, draft);
      }, WAIT_LIMITS);
    } catch (error) {
      return await this.recoverFromReplay(error, draft);
    }
  }

  /**
   * Anula un movimiento: devuelve lo que entró.
   *
   * **Sólo puede pedirlo quien lo recibió.** La anulación saca el dinero de las
   * cuentas donde entró, y dejar que lo pidiera quien envía convertiría el
   * libro en una herramienta de robo: pagas, te llevas la mercancía y te
   * llevas otra vez el dinero. Que quede escrito no lo arregla.
   *
   * Un ingreso no tiene dos partes —entra del mundo exterior a una cuenta
   * tuya—, así que quien recibe y quien ingresó son el mismo y la regla vale
   * igual sin excepción.
   *
   * La comprobación de fondos es la razón de que esto no sea una llamada suelta
   * a `ledger.reverse`: devolver lo que ya te gastaste dejaría la cuenta en
   * descubierto. Va con las cuentas bloqueadas y dentro de la misma
   * transacción, como una transferencia.
   */
  async reverse(order: ReversalOrder): Promise<PostedTransaction> {
    const original = await this.ledger.byId(order.transactionId);
    if (!original) throw new TransactionNotFoundError(order.transactionId);

    // Lo que la anulación va a sacar es exactamente lo que la original metió.
    const credited = original.entries.filter((entry) => entry.amount > 0n);
    const owned = await this.accountsOwnedBy(
      credited.map((entry) => entry.accountId),
      order.ownerId,
    );
    if (owned.size === 0) throw new NotYourTransactionError(order.transactionId);

    return this.prisma.$transaction(async (tx) => {
      await lockAccounts(
        tx,
        original.entries.map((entry) => entry.accountId),
      );

      for (const entry of credited) {
        await this.assertSufficientFunds(tx, entry.accountId, entry.amount);
      }

      return this.ledger.reverseWithin(tx, order.transactionId, order.description);
    }, WAIT_LIMITS);
  }

  /** De estas cuentas, cuáles son suyas. */
  private async accountsOwnedBy(accountIds: string[], ownerId: string): Promise<Set<string>> {
    const rows = await this.prisma.account.findMany({
      where: { id: { in: accountIds }, ownerId },
      select: { id: true },
    });

    return new Set(rows.map((row) => row.id));
  }

  /**
   * ¿Tiene la cuenta con qué?
   *
   * Se llama con la cuenta ya bloqueada; leer el saldo antes del bloqueo daría
   * un número que puede haber cambiado para cuando se escriba.
   */
  private async assertSufficientFunds(
    tx: LedgerExecutor,
    accountId: string,
    amount: bigint,
  ): Promise<void> {
    const account = await tx.account.findUnique({
      where: { id: accountId },
      select: { kind: true },
    });
    if (!account) throw new UnknownAccountError(accountId);

    // Las cuentas de sistema son el mundo exterior: de ahí sale el dinero que
    // entra al libro, así que están en negativo por definición.
    if (account.kind === "SYSTEM") return;

    const balance = await this.ledger.balanceOfWithin(tx, accountId);
    if (balance < amount) throw new InsufficientFundsError(accountId, balance, amount);
  }

  /**
   * La carrera de la clave de idempotencia, resuelta fuera de la transacción.
   *
   * Dos peticiones simultáneas con la misma clave pasan las dos el camino
   * rápido, y una choca contra el índice único. **Recuperarse dentro de la
   * transacción no es posible**: en Postgres una sentencia que falla la aborta
   * entera, y a partir de ahí cualquier consulta responde «current transaction
   * is aborted». Por eso la transacción se deja caer y la relectura se hace
   * aquí, cuando ya se deshizo y la ganadora está confirmada.
   */
  private async recoverFromReplay(
    error: unknown,
    draft: TransactionDraft,
  ): Promise<PostedTransaction> {
    if (draft.idempotencyKey !== undefined && isUniqueViolationOn(error, "idempotency_key")) {
      const winner = await this.ledger.byIdempotencyKey(draft.idempotencyKey);
      if (winner) return this.ledger.assertSamePayload(winner, draft);
    }

    throw error;
  }
}

/**
 * Coge las llaves de las cuentas, siempre en el mismo orden.
 *
 * El orden es lo que evita el interbloqueo. Sin él, una transferencia A→B y otra
 * B→A a la vez se quedan esperándose para siempre: cada una tiene la llave que
 * la otra necesita. Ordenando por id, las dos piden primero la misma y la
 * segunda espera en la puerta en vez de a mitad del pasillo.
 *
 * Postgres detecta el interbloqueo y mata a una de las dos, así que sin esto el
 * síntoma no sería un cuelgue sino un fallo intermitente e inexplicable bajo
 * carga.
 */
async function lockAccounts(tx: LedgerExecutor, accountIds: string[]): Promise<void> {
  for (const accountId of [...new Set(accountIds)].sort()) {
    await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${accountId}::uuid FOR UPDATE`;
  }
}

/** Convierte la orden en los dos asientos que la representan. */
function toDraft(order: TransferOrder): TransactionDraft {
  if (order.amount <= 0n) throw new NonPositiveAmountError(order.amount);

  if (order.fromAccountId === order.toAccountId) {
    throw new SameAccountTransferError(order.fromAccountId);
  }

  return {
    description: order.description ?? `Transferencia de ${formatUsd(order.amount)}`,
    idempotencyKey: order.idempotencyKey,
    entries: [
      { accountId: order.fromAccountId, amount: -order.amount },
      { accountId: order.toAccountId, amount: order.amount },
    ],
  };
}
