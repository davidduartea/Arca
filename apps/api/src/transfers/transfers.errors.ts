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
    readonly saldo: bigint,
    readonly solicitado: bigint,
  ) {
    super(
      `La cuenta ${accountId} tiene ${formatUsd(saldo)} y se le piden ${formatUsd(solicitado)}`,
    );
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
