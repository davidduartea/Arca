import { z } from "zod";

import { accountIdSchema } from "@/models/accounts/AccountId";

/**
 * Lo que hace falta para ingresar.
 *
 * Sólo lleva cuenta de destino, y tiene que ser una propia: el origen lo pone
 * el servidor —la cuenta del mundo exterior— porque si el cliente pudiera
 * elegirlo, cualquiera se transferiría dinero desde la nada.
 */
export const depositSchema = z.object({
  idempotencyKey: z.uuid("Esa clave de reintento no es válida."),
  toAccountId: accountIdSchema,
  amount: z.string().trim().min(1, "Falta el importe.").max(20, "Ese importe no cabe."),
  description: z.string().trim().max(140, "La descripción se pasa de larga.").default(""),
});

export type DepositInput = z.infer<typeof depositSchema>;
