import { z } from "zod";

import { accountIdSchema } from "@/models/accounts/AccountId";

/**
 * Lo que hace falta para pedir una página del extracto.
 *
 * El cursor es **opaco**: la aplicación no lo abre ni lo construye, sólo lo
 * devuelve tal cual. Por eso aquí no se comprueba su contenido, sólo que sea
 * texto de un tamaño razonable — quien decide qué significa es el servidor, y
 * el día que cambie de forma esto no se entera.
 */
export const statementQuerySchema = z.object({
  accountId: accountIdSchema,
  cursor: z.string().max(256, "Ese cursor no es de los nuestros.").optional(),
});

export type StatementQuery = z.infer<typeof statementQuerySchema>;
