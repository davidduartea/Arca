import { Controller, Get, Param, Query } from "@nestjs/common";
import { z } from "zod";

import { AccountsService } from "../accounts/accounts.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { statementPageView } from "../http/views";
import type { StatementPageView } from "../http/views";
import { ZodValidationPipe } from "../http/zod-validation.pipe";
import { toWire } from "../shared/money";
import { StatementsService } from "./statements.service";

/**
 * `limit` se coerciona pero no se valida aquí.
 *
 * La regla de qué tamaño de página es aceptable vive en el servicio, y tenerla
 * también aquí sería tenerla en dos sitios que se pueden desincronizar. Un
 * `limit=abc` llega como `NaN` y el servicio lo rechaza con su propio error.
 */
const statementQuerySchema = z.strictObject({
  cursor: z.string().optional(),
  limit: z.coerce.number().optional(),
});

/**
 * Sin fecha, el saldo es el de ahora mismo.
 *
 * El `eslint-disable` es por un falso positivo: `no-useless-assignment` no ve
 * los usos dentro de un decorador de parámetro, y ésta se usa más abajo en
 * `@Query`. Su hermana de arriba, idéntica en forma, no lo dispara.
 */
// eslint-disable-next-line no-useless-assignment
const balanceQuerySchema = z.strictObject({
  at: z
    .string()
    .optional()
    .transform((raw) => (raw === undefined ? new Date() : new Date(raw)))
    .refine((date) => !Number.isNaN(date.getTime()), "no es una fecha válida"),
});

@Controller("accounts/:accountId")
export class StatementsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly statements: StatementsService,
  ) {}

  @Get("statement")
  async statement(
    @CurrentUser() user: AuthenticatedUser,
    @Param("accountId") accountId: string,
    @Query(new ZodValidationPipe(statementQuerySchema))
    query: { cursor?: string; limit?: number },
  ): Promise<StatementPageView> {
    // Primero de quién es, después qué dice. Al revés se filtraría el extracto
    // de otro por el tiempo que tarda la respuesta, aunque el cuerpo no salga.
    await this.accounts.requireOwnedBy(accountId, user.id);

    return statementPageView(await this.statements.statement(accountId, query));
  }

  @Get("balance")
  async balance(
    @CurrentUser() user: AuthenticatedUser,
    @Param("accountId") accountId: string,
    @Query(new ZodValidationPipe(balanceQuerySchema))
    query: { at: Date },
  ): Promise<{ balance: string; at: string }> {
    await this.accounts.requireOwnedBy(accountId, user.id);

    return {
      balance: toWire(await this.statements.balanceAt(accountId, query.at)),
      at: query.at.toISOString(),
    };
  }
}
