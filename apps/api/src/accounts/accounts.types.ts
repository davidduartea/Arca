/**
 * Distingue las cuentas de personas de las del propio sistema.
 *
 * Un ingreso desde fuera tiene que salir de algún sitio, o la transacción no
 * cuadraría a cero. Sale de una cuenta de sistema — el equivalente contable de
 * «el mundo exterior» — que sí puede quedar en negativo.
 */
export type AccountKind = "USER" | "SYSTEM";

export interface AccountDraft {
  ownerId: string;
  name: string;
  kind?: AccountKind;
}

export interface Account {
  id: string;
  ownerId: string;
  name: string;

  /** Doce cifras. Lo unico que una persona ve, dicta o teclea de una cuenta. */
  number: string;

  kind: AccountKind;
  createdAt: Date;
}

/**
 * Lo que se contesta sobre un número de arca ajeno.
 *
 * Deliberadamente **no** es una `Account`: quien pregunta no es el dueño, y lo
 * único que le corresponde saber es a quién pertenece. Ni el identificador
 * interno, ni el nombre de la cuenta, ni su saldo.
 */
export interface AccountHolder {
  /** El nombre de la persona, no el de la cuenta. */
  name: string;

  kind: AccountKind;
}
