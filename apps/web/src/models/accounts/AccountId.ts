import { z } from "zod";

/**
 * El identificador interno de una cuenta.
 *
 * El esquema no es decoración. Este valor llega desde el navegador a acciones
 * de servidor que lo meten dentro de la ruta que se le pide a la API, y una
 * ruta se construye con cadenas: sin comprobar que es un uuid, un `..` o una
 * barra convierten `/accounts/<id>/statement` en otra dirección distinta,
 * pedida con la sesión de quien mira.
 */
export const accountIdSchema = z.uuid("Ese identificador de cuenta no es válido.");

export type AccountId = z.infer<typeof accountIdSchema>;
