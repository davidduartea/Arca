import type { AccountKind } from "@/models/enums/AccountKind";

/** Una cuenta, tal y como la devuelve la API. */
export interface AccountView {
  id: string;
  name: string;

  /** Doce cifras. Lo único de la cuenta que una persona ve, dicta o teclea. */
  number: string;

  kind: AccountKind;

  /** Centavos, como texto. Nunca un número. */
  balance: string;

  /**
   * Cuándo se cerró, o `null` si sigue abierta.
   *
   * Cerrada no manda ni recibe, pero su extracto se sigue leyendo: los asientos
   * son inmutables y una cuenta cerrada es histórico, no un hueco.
   */
  closedAt: string | null;

  createdAt: string;
}
