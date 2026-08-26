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
  kind: AccountKind;
  createdAt: Date;
}
