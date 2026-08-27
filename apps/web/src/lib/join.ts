/**
 * Junta clases y descarta lo que no hay.
 *
 * Con plantillas de texto, un `className` que llega sin valor acaba escrito
 * como la palabra «undefined» dentro del atributo. Cuatro líneas lo evitan, y
 * evitan también la dependencia de turno para hacer justo esto.
 */
export function join(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
