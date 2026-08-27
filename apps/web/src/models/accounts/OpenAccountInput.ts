import { z } from "zod";

/**
 * Lo que hace falta para abrir una cuenta: un nombre.
 *
 * Ni tipo, ni moneda, ni saldo inicial. El tipo lo decide el servidor — si el
 * cliente pudiera elegirlo, cualquiera abriría una cuenta de sistema y se
 * transferiría dinero desde la nada.
 *
 * El máximo repite el del campo del formulario a propósito: el `maxLength` del
 * `<input>` es una comodidad y se salta con dos líneas en la consola.
 */
export const openAccountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Ponle un nombre a la cuenta.")
    .max(80, "Ese nombre es muy largo."),
});

export type OpenAccountInput = z.infer<typeof openAccountSchema>;
