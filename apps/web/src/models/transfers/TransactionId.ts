import { z } from "zod";

/**
 * El identificador interno de un movimiento.
 *
 * Mismo motivo que en `accountIdSchema`, y aquí más caro: este valor viaja
 * dentro de la ruta que pide **anular**, así que una barra o un `..` sin
 * comprobar convertirían `/transactions/<id>/reversal` en otra dirección de la
 * API pedida con la sesión de quien mira, y encima por POST.
 */
export const transactionIdSchema = z.uuid("Ese identificador de movimiento no es válido.");

export type TransactionId = z.infer<typeof transactionIdSchema>;
