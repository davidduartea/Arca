/**
 * Las medidas que comparten acceder y registrarse.
 *
 * Las dos pantallas son la misma columna estrecha con la marca arriba y una
 * línea al pie que lleva a la otra. Vive aquí y no dentro de cada pantalla
 * porque duplicar el ancho en dos archivos es duplicar la decisión: el día que
 * cambie, una de las dos se queda atrás y nadie lo nota hasta verlas seguidas.
 */

/** Una columna estrecha y centrada: aquí sólo hay dos campos y un botón. */
export const pageClass = "mx-auto max-w-[360px]";

/** La línea del pie que lleva a la otra pantalla. */
export const altClass = "mt-s4 text-center text-[12.5px] text-ink-3";

/** El formulario en sí: los campos apilados y separados por s3. */
export const authFormClass = "flex flex-col gap-s3";
