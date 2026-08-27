import type { ZodError } from "zod";

/**
 * Qué decir cuando lo que llega no cuadra.
 *
 * ## Por qué se valida en el frontal si la API ya valida
 *
 * Porque `"use server"` **publica cada función que exporta como un endpoint**.
 * No es el formulario quien decide sus argumentos: es quien llama, y quien
 * llama puede ser una pestaña con la consola abierta. El `maxLength` de un
 * `<input>` y el `required` de un campo son comodidades para quien escribe, no
 * defensas — se saltan sin herramientas.
 *
 * La API sigue siendo la autoridad y vuelve a comprobarlo todo. Esto es la
 * primera puerta: para que nada sin forma llegue a cruzar el edificio, y para
 * que lo que la abre reciba una frase en vez de un 400.
 */

/** El primer problema, en palabras. Para los avisos que van arriba, sin campo. */
export function firstMessage(error: ZodError, fallback = "Revisa los datos."): string {
  return error.issues[0]?.message ?? fallback;
}

/**
 * Los problemas por campo, para enseñarlos junto a cada uno.
 *
 * Se queda con el primero de cada campo: dos frases debajo del mismo `<input>`
 * compiten entre sí y ninguna se lee.
 */
export function issuesByField(error: ZodError): Record<string, string> {
  const issues: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];

    if (typeof field === "string" && !(field in issues)) issues[field] = issue.message;
  }

  return issues;
}
