import { z } from "zod";

import { PASSWORD_MIN_LENGTH } from "@/models/auth/PasswordPolicy";

/**
 * Cambiar la contraseña: la de ahora y la que viene.
 *
 * La actual sólo tiene que estar. Medirla con la política dejaría fuera a quien
 * abrió su cuenta cuando el mínimo era menor —y le diría que su contraseña no
 * vale justo en la pantalla donde iba a cambiarla—. Es el mismo motivo por el
 * que el acceso tampoco la mide.
 *
 * La nueva sí, porque es la que va a quedarse.
 */
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Escribe tu contraseña actual.").max(200),
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `La contraseña necesita ${PASSWORD_MIN_LENGTH} caracteres o más.`)
    .max(200, "Esa contraseña es demasiado larga."),
});

export type PasswordChange = z.infer<typeof passwordChangeSchema>;
