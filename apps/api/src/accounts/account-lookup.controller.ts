import { Controller, Get, NotFoundException, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";

import { ZodValidationPipe } from "../http/zod-validation.pipe";
import { AccountsService } from "./accounts.service";

/**
 * A quién pertenece un número de arca.
 *
 * Existe para una sola cosa: que quien va a transferir vea el nombre de la
 * cuenta **antes** de confirmar. Sin eso, una cifra mal tecleada manda el
 * dinero a un desconocido y no hay forma de deshacerlo — sólo anularlo, y para
 * eso hace falta que la otra parte colabore.
 *
 * ## Lo que devuelve, y lo que no
 *
 * Sólo el nombre de la cuenta. Ni el correo de su dueño, ni su saldo, ni su
 * identificador interno. Es lo mínimo que confirma que el número es el
 * correcto.
 *
 * ## Por qué se puede consultar sin ser el dueño
 *
 * Porque para eso está: un número de arca se da precisamente a gente que no es
 * uno mismo. Lo que evita que sea una lista abierta son tres cosas —
 *
 *   · Diez elevado a once números posibles.
 *   · El dígito de control, que tumba diez de cada once intentos a ciegas.
 *   · Y este límite, más estrecho que el general: es una superficie de
 *     enumeración y se trata como tal.
 */
const LOOKUP_LIMIT = { default: { limit: 20, ttl: 60_000 } };

/**
 * Falso positivo conocido: `no-useless-assignment` no ve los usos que hay
 * dentro de un decorador de parámetro, y ésta se usa más abajo en `@Query`.
 * Es el mismo caso que en el controlador del extracto.
 */
// eslint-disable-next-line no-useless-assignment
const lookupQuerySchema = z.object({
  number: z.string().trim().min(1, "hace falta un número de arca").max(32),
});

@Controller("accounts")
export class AccountLookupController {
  constructor(private readonly accounts: AccountsService) {}

  @Throttle(LOOKUP_LIMIT)
  @Get("lookup")
  async lookup(
    @Query(new ZodValidationPipe(lookupQuerySchema)) query: { number: string },
  ): Promise<{ name: string }> {
    const account = await this.accounts.byNumber(query.number);

    // Mismo 404 para «el dígito no cuadra», «no existe» y «es del sistema»:
    // quien pregunta no tiene por qué distinguirlos, y distinguirlos serviría
    // para mapear qué números están emitidos.
    if (!account || account.kind === "SYSTEM") {
      throw new NotFoundException({
        error: "UnknownAccountError",
        message: "No encontramos ninguna arca con ese número",
      });
    }

    return { name: account.name };
  }
}
