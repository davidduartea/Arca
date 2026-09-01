import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
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
const ACCOUNT_NAME = z.string().trim().min(1, "hace falta un nombre").max(80);

const newAccountSchema = z.object({ name: ACCOUNT_NAME });

const renameSchema = z.object({ name: ACCOUNT_NAME });

const accountIdSchema = z.string().uuid("no es un identificador de cuenta");

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
    const mine = await this.accounts.byOwner(user.id);

    return {
      accounts: await Promise.all(
        mine.map(async (account) =>
          accountView(account, await this.ledger.balanceOf(account.id)),
        ),
      ),
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async open(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(newAccountSchema)) body: { name: string },
  ): Promise<AccountView> {
    const account = await this.accounts.open({ ownerId: user.id, name: body.name });

    return accountView(account, 0n);
  }

  @Get(":accountId")
  async one(
    @CurrentUser() user: AuthenticatedUser,
    @Param("accountId") accountId: string,
  ): Promise<AccountView> {
    const account = await this.accounts.requireOwnedBy(accountId, user.id);

    return accountView(account, await this.ledger.balanceOf(account.id));
  }

  /**
   * Le cambia el nombre.
   *
   * Una cuenta se abría y ya está: mal nombrada, se quedaba así para siempre.
   * Renombrar no tiene consecuencias en ninguna parte — quien la identifica es
   * el número, que no se toca, y el extracto y los asientos siguen igual.
   *
   * Se puede renombrar una cuenta cerrada: es su etiqueta, y ordenar lo que ya
   * no se usa es parte de por qué alguien la cerró.
   */
  @Patch(":accountId")
  async rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param("accountId", new ZodValidationPipe(accountIdSchema)) accountId: string,
    @Body(new ZodValidationPipe(renameSchema)) body: { name: string },
  ): Promise<AccountView> {
    const account = await this.accounts.rename(accountId, user.id, body.name);

    return accountView(account, await this.ledger.balanceOf(account.id));
  }

  /**
   * La cierra: deja de mandar y de recibir, y su extracto se sigue leyendo.
   *
   * Sub-recurso y no un campo en el `PATCH` de arriba porque no es un dato de
   * la cuenta sino un acto con sus propias reglas — hay que estar a cero — y con
   * su propio deshacer, que es el `DELETE` de abajo. Escrito como un campo más,
   * `{"name":"Ahorro","closed":true}` haría dos cosas distintas en una llamada y
   * una de las dos puede fallar.
   *
   * El saldo se pasa como función: el servicio de cuentas no sabe sumar
   * asientos —y no debe, el saldo es del libro— pero tampoco tiene por qué
   * calcularse antes de saber que la cuenta es de quien la cierra.
   */
  @Post(":accountId/closure")
  @HttpCode(HttpStatus.OK)
  async close(
    @CurrentUser() user: AuthenticatedUser,
    @Param("accountId", new ZodValidationPipe(accountIdSchema)) accountId: string,
  ): Promise<AccountView> {
    let balance: bigint | undefined;
    const balanceOf = async (): Promise<bigint> =>
      (balance ??= await this.ledger.balanceOf(accountId));

    const account = await this.accounts.close(accountId, user.id, balanceOf);

    return accountView(account, await balanceOf());
  }

  /** La vuelve a abrir. Un cierre sin vuelta atrás sería una cuenta perdida. */
  @Delete(":accountId/closure")
  @HttpCode(HttpStatus.OK)
  async reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param("accountId", new ZodValidationPipe(accountIdSchema)) accountId: string,
  ): Promise<AccountView> {
    const account = await this.accounts.reopen(accountId, user.id);

    return accountView(account, await this.ledger.balanceOf(account.id));
  }
}
