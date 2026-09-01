import { formatUsd } from "../shared/money";

/** Lo que puede salir mal al administrar una cuenta propia. */
export abstract class AccountError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Se ha pedido cerrar una cuenta que todavía tiene dinero.
 *
 * Cerrar con saldo sería esconderlo: la cuenta sale de las que se pueden usar y
 * el dinero se queda dentro sin que nadie haya dicho a dónde iba. Que lo saque
 * su dueño primero, y entonces sí.
 *
 * El importe va en el mensaje porque es su propia cuenta: no revela nada que
 * quien pregunta no pueda ver en la pantalla desde la que lo pidió.
 */
export class AccountNotEmptyError extends AccountError {
  constructor(
    readonly accountId: string,
    readonly balance: bigint,
  ) {
    super(`La cuenta todavía tiene ${formatUsd(balance)}`);
  }
}

/**
 * Se ha intentado usar una cuenta cerrada para mover dinero.
 *
 * Vale para los dos lados: ni sale de una cerrada ni entra en una cerrada. Lo
 * que sí llega es la anulación de un movimiento antiguo — cerrar detiene lo que
 * empiezas, no lo que vuelve.
 */
export class AccountClosedError extends AccountError {
  constructor(readonly accountId: string) {
    super("Esa cuenta está cerrada");
  }
}
