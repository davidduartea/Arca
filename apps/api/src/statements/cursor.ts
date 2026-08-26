import { isUuid } from "../shared/uuid";
import { InvalidCursorError } from "./statements.errors";

/**
 * Por dónde sigue el extracto.
 *
 * Son **dos** campos y no uno porque la fecha sola empata. En Postgres `now()`
 * devuelve la hora de inicio de la transacción, no la de cada fila, así que
 * todos los asientos de un mismo movimiento comparten `created_at` al
 * milisegundo. Con un cursor de sólo fecha, los empatados se pierden o se
 * repiten al pasar de página — y en un extracto bancario eso significa un
 * movimiento que desaparece.
 */
export interface StatementCursor {
  createdAt: Date;
  id: string;
}

const SEPARADOR = "|";

/**
 * El cursor se codifica para que sea **opaco**.
 *
 * No es por ocultar nada: es para que quien lo recibe no pueda construirlo a
 * mano ni depender de su formato. El día que la clave de paginación cambie —
 * porque se añada una columna al orden, por ejemplo — ningún cliente se rompe,
 * porque ninguno estaba leyendo dentro.
 *
 * `base64url` y no `base64` porque el cursor viaja en una query string, y los
 * `+` y `/` del alfabeto normal hay que escaparlos.
 */
export function encodeCursor(cursor: StatementCursor): string {
  const plano = `${cursor.createdAt.toISOString()}${SEPARADOR}${cursor.id}`;

  return Buffer.from(plano, "utf8").toString("base64url");
}

export function decodeCursor(raw: string): StatementCursor {
  // `Buffer.from` con base64 no falla ante basura: se come lo que puede y
  // devuelve lo que sea. Así que validar el resultado no es opcional.
  const plano = Buffer.from(raw, "base64url").toString("utf8");
  const partes = plano.split(SEPARADOR);

  if (partes.length !== 2) throw new InvalidCursorError(raw);

  const [fecha, id] = partes;
  if (fecha === undefined || id === undefined) throw new InvalidCursorError(raw);
  if (!isUuid(id)) throw new InvalidCursorError(raw);

  const createdAt = new Date(fecha);
  if (Number.isNaN(createdAt.getTime())) throw new InvalidCursorError(raw);

  return { createdAt, id };
}
