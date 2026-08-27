import { z } from "zod";

import { accountIdSchema } from "@/models/accounts/AccountId";

/**
 * Cuánto había el… — la cuenta y el instante.
 *
 * La fecha llega como texto y se convierte aquí, para que lo que salga del
 * esquema sea ya un `Date` válido y nadie tenga que volver a comprobarlo.
 * Una fecha imposible se para en esta puerta y no viaja.
 */
export const balanceAtQuerySchema = z.object({
  accountId: accountIdSchema,
  at: z.coerce.date("Esa no es una fecha."),
});

export type BalanceAtQuery = z.infer<typeof balanceAtQuerySchema>;
