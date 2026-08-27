import { z } from "zod";

/**
 * El número que se le da a otra persona para poder recibir dinero.
 *
 * Doce cifras y nada más. El dígito de control se comprueba en el navegador
 * mientras se teclea y lo garantiza un `CHECK` en la base; aquí sólo se
 * verifica la forma, que es lo que impide que llegue a la API cualquier cosa
 * escrita a mano contra el endpoint de la acción.
 */
export const accountNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{12}$/u, "Un número de arca son doce cifras.");

export type AccountNumber = z.infer<typeof accountNumberSchema>;
