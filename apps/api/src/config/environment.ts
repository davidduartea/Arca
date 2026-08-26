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

  DATABASE_URL: z
    .string()
    .min(1, "hace falta la cadena de conexión")
    .refine(
      (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
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
