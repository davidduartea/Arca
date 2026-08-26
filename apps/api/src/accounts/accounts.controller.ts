import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { z } from "zod";

import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../http/zod-validation.pipe";
import { accountView } from "../http/views";
import type { AccountView } from "../http/views";
import { LedgerService } from "../ledger/ledger.service";
import { AccountsService } from "./accounts.service";

/**
 * `kind` no se acepta a propósito.
 *
 * Sólo hay dos tipos de cuenta y uno de ellos, `SYSTEM`, se salta la
 * comprobación de fondos. Si el cliente pudiera elegirlo, cualquiera abriría una
 * cuenta de sistema y se transferiría dinero desde la nada.
 */
const cuentaNueva = z.object({
  name: z.string().trim().min(1, "hace falta un nombre").max(80),
});

@Controller("accounts")
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Las cuentas de quien pregunta, con su saldo.
   *
   * Es una consulta de saldo por cuenta. Con las tres o cuatro que tiene una
   * persona da igual; el día que importe, la respuesta es la misma que para
   * `balanceOf` — instantáneas, no un campo `balance`.
   */
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<{ accounts: AccountView[] }> {
    const mias = await this.accounts.byOwner(user.id);

    return {
      accounts: await Promise.all(
        mias.map(async (cuenta) => accountView(cuenta, await this.ledger.balanceOf(cuenta.id))),
      ),
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async open(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(cuentaNueva)) body: { name: string },
  ): Promise<AccountView> {
    const cuenta = await this.accounts.open({ ownerId: user.id, name: body.name });

    return accountView(cuenta, 0n);
  }

  @Get(":accountId")
  async one(
    @CurrentUser() user: AuthenticatedUser,
    @Param("accountId") accountId: string,
  ): Promise<AccountView> {
    const cuenta = await this.accounts.requireOwnedBy(accountId, user.id);

    return accountView(cuenta, await this.ledger.balanceOf(cuenta.id));
  }
}
