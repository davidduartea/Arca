import { BadRequestException, Injectable } from "@nestjs/common";
import type { PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/**
 * Valida lo que entra por HTTP con el mismo Zod que valida el entorno.
 *
 * Se usa Zod y no `class-validator` por dos motivos. El proyecto ya lo tiene, y
 * sobre todo: Zod **transforma además de validar**, así que el tipo que sale
 * del pipe ya es el del dominio — un importe llega como texto y sale como
 * `bigint`, sin que el controlador tenga que acordarse de convertirlo.
 *
 * ## Todos los esquemas que pasan por aquí son estrictos
 *
 * `z.strictObject` y no `z.object`: un campo que nadie esperaba es un 400, no
 * un campo que se ignora en silencio. Por dos razones.
 *
 * La primera es que un cliente que manda `{"amount":"100","curency":"eur"}` se
 * entera de que se escribió mal en vez de ver cómo su dato desaparece. La
 * segunda importa más y es de seguridad: mientras el esquema se traga lo que
 * sobra, el objeto que sale de él **no es** el objeto que se validó, y el día
 * que alguien escriba `data: body` en una escritura de Prisma —el atajo que
 * todo el mundo escribe alguna vez— irá a la base todo lo que quien llamó
 * quisiera meter, columnas incluidas. Con esquemas estrictos ese atajo es
 * seguro por construcción y no por vigilancia.
 *
 * El precio es que añadir un campo obliga a añadirlo también aquí, que es
 * exactamente lo que se quiere que cueste.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    // Se devuelven todos los problemas de una vez. Corregir a ciegas, error a
    // error, es innecesariamente lento cuando el validador ya los vio todos.
    throw new BadRequestException({
      message: "Los datos enviados no son válidos",
      issues: result.error.issues.map((issue) => ({
        field: issue.path.join(".") || "(raíz)",
        message: issue.message,
      })),
    });
  }
}
