import type { StatementLineView } from "@/models/statements/StatementLineView";

/** Una página del extracto, del movimiento más reciente al más antiguo. */
export interface StatementPageView {
  lines: StatementLineView[];

  /** Se devuelve tal cual para pedir la siguiente página. `null` si no queda nada. */
  nextCursor: string | null;
}
