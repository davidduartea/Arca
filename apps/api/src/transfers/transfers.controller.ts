import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
} from "@nestjs/common";
import { z } from "zod";

import { AccountsService } from "../accounts/accounts.service";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { transactionView } from "../http/views";
import type { TransactionView } from "../http/views";
import { ZodValidationPipe } from "../http/zod-validation.pipe";
import { WORLD_ACCOUNT_ID } from "../shared/system-account";
import { TransfersService } from "./transfers.service";

/**
 * El importe entra como **texto**, y un número JSON se rechaza.
 *
 * Aceptar `2500` además de `"2500"` parece amable y es justo lo contrario:
 * volvería a meter el importe por un `double` de IEEE 754, y por encima de 2^53
 * centavos el redondeo pasa sin que nadie se entere. Que falle ruidosamente es
 * la parte útil.
 *
 * El signo tampoco se acepta: la dirección la marcan las cuentas. Un importe
 * negativo sería una transferencia al revés disfrazada, capaz de esquivar la
 * comprobación de fondos de quien la recibe.
 */
const amountInCents = z
  .string({ message: "el importe debe llegar como texto, no como número" })
  .regex(/^\d+$/, "centavos en dígitos, sin signo ni decimales")
  .transform(BigInt);

const accountIdSchema = z.string().uuid("no es un identificador de cuenta");

/**
 * El destino se teclea, asi que llega como numero de arca y no como uuid.
 *
 * Se acepta escrito de cualquier forma. Quien lo comprueba de verdad es
 * `AccountsService.byNumber`, que valida el digito de control antes de
 * preguntarle nada a la base.
 */
const arcaNumberSchema = z.string().trim().min(12, "un numero de arca son doce cifras").max(32);

const transferOrderSchema = z.object({
  fromAccountId: accountIdSchema,
  toAccountNumber: arcaNumberSchema,
  amount: amountInCents,
  description: z.string().trim().min(1).max(140).optional(),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

const depositOrderSchema = z.object({
  toAccountId: accountIdSchema,
  amount: amountInCents,
  description: z.string().trim().min(1).max(140).optional(),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

@Controller()
export class TransfersController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly transfers: TransfersService,
  ) {}

  /**
   * Mueve dinero de una cuenta tuya a otra cualquiera.
   *
   * La comprobación de propiedad es sobre el **origen**, y es el control de
   * seguridad de todo el módulo: se puede ingresar en la cuenta de cualquiera,
   * pero sólo se puede sacar de la propia.
   */
  @Post("transfers")
  @HttpCode(HttpStatus.CREATED)
  async transfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(transferOrderSchema))
    body: z.output<typeof transferOrderSchema>,
  ): Promise<TransactionView> {
    await this.accounts.requireOwnedBy(body.fromAccountId, user.id);

    const { toAccountNumber, ...order } = body;
    const destination = await this.accounts.byNumber(toAccountNumber);

    // Mismo rechazo si el dígito de control no cuadra, si el número no está
    // emitido o si apunta a una cuenta de sistema: quien transfiere no tiene
    // por qué distinguirlos, y distinguirlos serviría para ir mapeando qué
    // números existen.
    if (!destination || destination.kind === "SYSTEM") {
      throw new NotFoundException({
        error: "UnknownAccountError",
        message: "No encontramos ninguna arca con ese número",
      });
    }

    return transactionView(
      await this.transfers.transfer({ ...order, toAccountId: destination.id }),
    );
  }

  /**
   * Simula un ingreso desde fuera del banco.
   *
   * En un banco de verdad esto no lo pide el cliente: lo produce una
   * transferencia entrante, un cajero o una pasarela de pago. Aquí existe para
   * que se pueda usar la aplicación, y por eso sólo deja ingresar en cuentas
   * propias — si dejara elegir el origen, cualquiera se transferiría dinero
   * desde la nada.
   */
  @Post("deposits")
  @HttpCode(HttpStatus.CREATED)
  async deposit(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(depositOrderSchema)) body: z.output<typeof depositOrderSchema>,
  ): Promise<TransactionView> {
    await this.accounts.requireOwnedBy(body.toAccountId, user.id);

    return transactionView(
      await this.transfers.transfer({
        ...body,
        fromAccountId: WORLD_ACCOUNT_ID,
        description: body.description ?? "Ingreso",
      }),
    );
  }
}
