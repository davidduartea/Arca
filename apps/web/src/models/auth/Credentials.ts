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
 * Para registrarse: aquí sí manda la política.
 *
 * Doce caracteres y ninguna regla más. Las mayúsculas y los símbolos
 * obligatorios producen «Password1!» una y otra vez; es la longitud lo que de
 * verdad protege.
 */
export const registrationSchema = z.object({
  email,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `La contraseña necesita ${PASSWORD_MIN_LENGTH} caracteres o más.`)
    .max(200, "Esa contraseña es demasiado larga."),
});

export type Credentials = z.infer<typeof credentialsSchema>;
export type Registration = z.infer<typeof registrationSchema>;
