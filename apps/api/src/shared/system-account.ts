/**
 * Las filas del sistema, creadas por una migración con estos identificadores.
 *
 * De la cuenta del mundo exterior sale el dinero que entra al libro. Está en
 * negativo por definición y la comprobación de fondos no se le aplica, porque
 * limitar cuánto puede «salir del mundo» no significaría nada.
 *
 * Su dueño es un usuario que no puede iniciar sesión: su hash no tiene la forma
 * que exige la verificación, así que ninguna contraseña coincide con él.
 */
export const SYSTEM_USER_ID = "00000000-0000-4000-8000-000000000001";
export const WORLD_ACCOUNT_ID = "00000000-0000-4000-8000-000000000002";
