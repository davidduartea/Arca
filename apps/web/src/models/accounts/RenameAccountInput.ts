import { z } from "zod";

import { accountIdSchema } from "@/models/accounts/AccountId";

/**
 * Cambiarle el nombre a una cuenta.
 *
 * El identificador se comprueba aunque venga de la propia pantalla: esto es una
 * acción de servidor, o sea un endpoint público cuyos argumentos elige quien
 * llama. Y viaja **dentro de la ruta** que se le pide a la API, así que una
 * barra sin comprobar convertiría `/accounts/<id>` en otra dirección, pedida
 * con la sesión de quien mira.
 *
 * El máximo repite el del campo del formulario a propósito: el `maxLength` de
 * un `<input>` es una comodidad y se salta con dos líneas en la consola.
 */
export const renameAccountSchema = z.object({
  accountId: accountIdSchema,
  name: z
    .string()
    .trim()
    .min(1, "Ponle un nombre a la cuenta.")
    .max(80, "Ese nombre es muy largo."),
});

export type RenameAccountInput = z.infer<typeof renameAccountSchema>;
