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
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const resultado = this.schema.safeParse(value);
    if (resultado.success) return resultado.data;

    // Se devuelven todos los problemas de una vez. Corregir a ciegas, error a
    // error, es innecesariamente lento cuando el validador ya los vio todos.
    throw new BadRequestException({
      message: "Los datos enviados no son válidos",
      issues: resultado.error.issues.map((problema) => ({
        field: problema.path.join(".") || "(raíz)",
        message: problema.message,
      })),
    });
  }
}
