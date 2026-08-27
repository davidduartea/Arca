/**
 * Lo que se sabe del destino, según lo que hay escrito.
 *
 * Cinco estados y no dos. Mientras se teclea no hay error todavía, y enseñar
 * uno antes de la última cifra es regañar a alguien que va por la mitad.
 */
export type Destination =
  | { kind: "incomplete" }
  | { kind: "impossible" }
  | { kind: "checking"; number: string }
  | { kind: "unknown"; number: string }
  | { kind: "found"; number: string; name: string };
