/**
 * Las piezas de un campo.
 *
 * Son cadenas de clases y no un componente `<Field>` con propiedades: los seis
 * formularios de la aplicación tienen estructuras distintas —el del número de
 * arca lleva un prefijo impreso dentro, el de la sesión caducada esconde el
 * correo, el de la contraseña añade un contador— y un componente que las cubra
 * todas acaba con más propiedades que marcado.
 *
 * Cada clase se escribe sobre su propio elemento. Antes el estilo bajaba desde
 * `.field` a los hijos por descendencia, y eso significaba que un `<input>`
 * fuera de esa caja se veía distinto sin que nadie lo hubiera decidido.
 */

/** La caja: etiqueta, campo y pista, apilados. */
export const fieldClass = "flex flex-col gap-s1";

/** La etiqueta: pequeña y en tinta suave. Está para leerse antes, no durante. */
export const labelClass = "text-[11.5px] text-ink-3";

/** El campo. Filete de 1,5 px, papel debajo, sin redondear. */
export const inputClass =
  "w-full border-[1.5px] border-ink bg-paper px-[11px] py-[9px] text-[14px] text-ink placeholder:text-ink-4";

/** La pista de debajo: por qué se pide, o qué formato tiene. Nunca un regaño. */
export const hintClass = "text-[11.5px] leading-[1.45] text-ink-3";
