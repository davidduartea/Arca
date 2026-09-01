import { z } from "zod";

import { PASSWORD_MIN_LENGTH } from "@/models/auth/PasswordPolicy";

/**
 * Correo y contraseña.
 *
 * La API vuelve a validarlos y es ella la que manda; esto es la primera puerta.
 * Existe porque una acción de servidor es un endpoint público: sus argumentos
 * los elige quien llama, no el formulario, y sin esta comprobación llegaría a
 * la API cualquier cosa que alguien quisiera mandarle.
 */
const email = z.email("Ese correo no tiene buena pinta.").max(254);

/**
 * Para entrar: que estén, y poco más.
 *
 * **La política de longitud no se aplica aquí a propósito.** El mínimo puede
 * subir algún día, y comprobarlo al entrar dejaría fuera a quien abrió su
 * cuenta cuando era menor — con un mensaje que además le diría que su
 * contraseña ya no vale, sin poder cambiarla porque no puede entrar.
 */
export const credentialsSchema = z.object({
  email,
  password: z.string().min(1, "Falta la contraseña.").max(200),
});

/**
 * El nombre de la persona.
 *
 * Sin comprobar que «parezca» un nombre: los del mundo no caben en ninguna
 * expresión regular — apellidos con apóstrofo, con guiones, en otro alfabeto,
 * de una sola letra. Lo único que se exige es que no esté en blanco, porque es
 * lo que ve quien va a mandarte dinero y un hueco ahí no confirma nada.
 */
export const personNameSchema = z
  .string()
  .trim()
  .min(1, "Pon tu nombre.")
  .max(80, "Ese nombre es muy largo.");

/**
 * Para registrarse: aquí sí manda la política.
 *
 * Doce caracteres y ninguna regla más. Las mayúsculas y los símbolos
 * obligatorios producen «Password1!» una y otra vez; es la longitud lo que de
 * verdad protege.
 *
 * Y un nombre, que es lo que verá quien te transfiera. No es un adorno de
 * perfil: sin él, la pantalla que confirma el destino sólo puede enseñar el
 * nombre de la cuenta ajena, que es una etiqueta privada y además no dice a
 * quién se le manda el dinero.
 */
export const registrationSchema = z.object({
  name: personNameSchema,
  email,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `La contraseña necesita ${PASSWORD_MIN_LENGTH} caracteres o más.`)
    .max(200, "Esa contraseña es demasiado larga."),
});

/** Cambiarlo después. Sin contraseña: esto no da acceso a nada ni se lo quita a nadie. */
export const nameChangeSchema = z.object({ name: personNameSchema });

export type Credentials = z.infer<typeof credentialsSchema>;
export type Registration = z.infer<typeof registrationSchema>;
export type NameChange = z.infer<typeof nameChangeSchema>;
