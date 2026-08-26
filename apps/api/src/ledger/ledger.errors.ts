/**
 * Los errores del libro contable.
 *
 * Son errores de **dominio**, no de HTTP: el motor de asientos no sabe que
 * existe una web. Traducirlos a códigos de estado es trabajo de la capa que
 * atiende peticiones, y hacerlo aquí ataría el núcleo a un transporte
 * concreto — el mismo motor tiene que servir para un cron o un script.
 */
export abstract class LedgerError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Los asientos no suman cero: hay dinero que aparece o desaparece. */
export class UnbalancedTransactionError extends LedgerError {
  constructor(readonly imbalance: bigint) {
    super(`La transacción descuadra en ${imbalance} centavos: los asientos deben sumar cero`);
  }
}

/** Un solo asiento no es partida doble. */
export class InsufficientEntriesError extends LedgerError {
  constructor(readonly received: number) {
    super(`Una transacción necesita al menos dos asientos y llegaron ${received}`);
  }
}

/** Un importe de cero no mueve nada y ensucia el extracto. */
export class ZeroAmountError extends LedgerError {
  constructor(readonly accountId: string) {
    super(`El asiento de la cuenta ${accountId} tiene importe cero`);
  }
}

export class UnknownAccountError extends LedgerError {
  constructor(readonly accountId: string) {
    super(`La cuenta ${accountId} no existe`);
  }
}

export class TransactionNotFoundError extends LedgerError {
  constructor(readonly transactionId: string) {
    super(`La transacción ${transactionId} no existe`);
  }
}

/** Cada transacción se anula una sola vez; lo garantiza un índice único. */
export class AlreadyReversedError extends LedgerError {
  constructor(readonly transactionId: string) {
    super(`La transacción ${transactionId} ya está anulada`);
  }
}

/**
 * La misma clave de idempotencia con un contenido distinto.
 *
 * Devolver la transacción original sería mentir — el cliente pidió otra cosa.
 * Y crear una nueva rompería la promesa de la clave. Sólo queda el error.
 */
export class IdempotencyKeyReusedError extends LedgerError {
  constructor(readonly idempotencyKey: string) {
    super(`La clave de idempotencia «${idempotencyKey}» ya se usó con otro contenido`);
  }
}

/**
 * La base rechazó la escritura por una de sus propias invariantes.
 *
 * Que esto salte significa que algo llegó a la base sin pasar por las
 * validaciones del servicio. No debería ocurrir: es la red de seguridad.
 */
export class LedgerInvariantViolatedError extends LedgerError {
  constructor(readonly detail: string) {
    super(`La base rechazó la escritura: ${detail}`);
  }
}
