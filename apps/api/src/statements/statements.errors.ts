export abstract class StatementError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * El cursor no es uno de los nuestros.
 *
 * No es un problema de seguridad: el cursor sólo dice por dónde seguir, y la
 * cuenta la pone quien pregunta, no el cursor. Manipularlo sólo consigue ver
 * otra página de lo que ya se podía ver. Se valida para dar un error claro en
 * vez de una consulta con una fecha absurda.
 */
export class InvalidCursorError extends StatementError {
  constructor(readonly cursor: string) {
    super(`El cursor «${cursor}» no es válido`);
  }
}

/** Pedir cero líneas, o media línea, es un error de quien llama. */
export class InvalidPageSizeError extends StatementError {
  constructor(readonly limit: number) {
    super(`El tamaño de página debe ser un entero positivo y llegó ${limit}`);
  }
}
