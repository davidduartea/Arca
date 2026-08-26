import { z } from "zod";

/**
 * El entorno, validado al arrancar.
 *
 * Falla en el arranque y no en la primera petición: un proceso que levanta con
 * la configuración a medias es peor que uno que no levanta, porque parece sano
 * hasta que alguien lo usa.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  /**
   * Con qué se firman los tokens.
   *
   * Largo de verdad: un secreto corto se rompe a fuerza bruta sin necesidad de
   * tocar el servidor, porque el atacante ya tiene el token firmado.
   */
  JWT_SECRET: z.string().min(32, "hacen falta al menos 32 caracteres"),

  /**
   * Cuántos proxies hay delante en los que se puede confiar.
   *
   * Por defecto **cero**, que es lo seguro: sin proxy, la IP que ve Express es
   * la de verdad. Poner un número mayor sin tener esos proxies delante deja que
   * cualquiera falsifique su IP con una cabecera `X-Forwarded-For` y esquive
   * la limitación de intentos; dejarlo a cero teniéndolos hace que todo el
   * mundo comparta la IP del proxy y se limiten unos a otros.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

  DATABASE_URL: z
    .string()
    .min(1, "hace falta la cadena de conexión")
    .refine(
      (url) => url.startsWith("postgresql://") || url.startsWith("postgres://"),
      "debe ser una URL de PostgreSQL",
    ),
});

export type Environment = z.infer<typeof schema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const result = schema.safeParse(source);

  if (!result.success) {
    const detalle = result.error.issues
      .map((issue) => `  · ${issue.path.join(".") || "(raíz)"}: ${issue.message}`)
      .join("\n");

    throw new Error(`Entorno inválido:\n${detalle}`);
  }

  return result.data;
}
