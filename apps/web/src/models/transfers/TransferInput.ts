import { z } from "zod";

import { accountIdSchema } from "@/models/accounts/AccountId";
import { accountNumberSchema } from "@/models/accounts/AccountNumber";

/**
 * Lo que hace falta para transferir.
 *
 * El importe se queda como texto y no se convierte aquí: quien sabe leer
 * «1250,50» es `dollarsToCents`, y es también quien da el mensaje bueno cuando
 * no se entiende. Este esquema comprueba la forma; el importe tiene su propio
 * guardián.
 *
 * La clave de idempotencia se exige uuid. La genera el navegador y sirve para
 * que un reintento no cobre dos veces; aceptar cualquier texto dejaría que
 * alguien eligiera una clave repetida a propósito para que su movimiento se
 * confundiera con otro.
 */
export const transferSchema = z.object({
  idempotencyKey: z.uuid("Esa clave de reintento no es válida."),
  fromAccountId: accountIdSchema,
  toAccountNumber: accountNumberSchema,
  amount: z.string().trim().min(1, "Falta el importe.").max(20, "Ese importe no cabe."),
  description: z.string().trim().max(140, "La descripción se pasa de larga.").default(""),
});

export type TransferInput = z.infer<typeof transferSchema>;
