import { formatUsd } from "../shared/money";

export abstract class TransferError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * La cuenta no tiene con qué.
 *
 * Sólo se aplica a las cuentas de persona. Las de sistema representan el mundo
 * exterior: de ahí sale el dinero que entra al libro, así que su saldo es
 * negativo por definición y limitarlo no significaría nada.
 */
export class InsufficientFundsError extends TransferError {
  constructor(
    readonly accountId: string,
    readonly balance: bigint,
    readonly requested: bigint,
  ) {
    super(
      `La cuenta ${accountId} tiene ${formatUsd(balance)} y se le piden ${formatUsd(requested)}`,
    );
  }
}

/**
 * Anular es devolver, no recuperar.
 *
 * Sólo puede anular un movimiento quien lo **recibió**: la anulación saca el
 * dinero de donde entró, y eso únicamente lo puede pedir el dueño de esa
 * cuenta. Si pudiera pedirlo quien envía, cualquiera podría pagar algo,
 * llevárselo y volver a llevarse el dinero — y el libro lo dejaría escrito,
 * pero escrito y ya robado.
 *
 * Para un ingreso no hay dos partes: el dinero entra del mundo exterior a una
 * cuenta tuya, así que el que recibe y el que ingresó son el mismo. La regla no
 * necesita excepción.
 *
 * Viaja al cliente como un 404 sin detalle, igual que `NotYourAccountError`:
 * distinguir «no existe» de «no es tuya» serviría para ir descubriendo qué
 * transacciones existen.
 */
export class NotYourTransactionError extends TransferError {
  constructor(readonly transactionId: string) {
    super(`La transacción ${transactionId} no abonó nada en ninguna cuenta tuya`);
  }
}

/** Mover dinero de una cuenta a sí misma no mueve nada. */
export class SameAccountTransferError extends TransferError {
  constructor(readonly accountId: string) {
    super(`El origen y el destino son la misma cuenta: ${accountId}`);
  }
}

/**
 * El importe tiene que ser positivo.
 *
 * Una transferencia de importe negativo sería una transferencia al revés
 * disfrazada, y esquivaría la comprobación de fondos de quien la recibe.
 */
export class NonPositiveAmountError extends TransferError {
  constructor(readonly amount: bigint) {
    super(`El importe de una transferencia debe ser positivo y llegó ${amount}`);
  }
}
