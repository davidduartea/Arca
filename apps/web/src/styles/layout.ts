/**
 * Dos medidas que se repiten en todas las pantallas.
 */

/**
 * La columna.
 *
 * 980 px y ni uno más: por encima de eso una línea de texto deja de poder
 * leerse de un barrido y el ojo tiene que volver a buscar el margen izquierdo.
 */
export const wrapClass = "mx-auto w-full max-w-[980px] px-s5";

/**
 * El ancho al que la barra deja de estar tendida.
 *
 * Copia de `--breakpoint-nav` en `globals.css`, que es quien manda en el CSS.
 * Aquí hace falta porque el menú desplegado tiene que enterarse de que la
 * pantalla se ha ensanchado —girar el teléfono— y cerrarse solo; una media
 * query en la hoja de estilos lo esconde, pero no le quita el estado.
 *
 * Duplicar un número es feo. La alternativa era leerlo del CSS en tiempo de
 * ejecución para ahorrarse cuatro caracteres escritos dos veces, y eso es peor:
 * un valor que no se puede ver leyendo ninguno de los dos archivos.
 */
export const NAV_BREAKPOINT = 720;

/**
 * Etiqueta de sección: mono, versalitas, muy espaciada.
 *
 * Va sin color a propósito, y cada sitio pone el suyo —`text-ink-4` en el libro,
 * `text-green-light` sobre el certificado—. Si trajera uno de fábrica, quien lo
 * cambiara escribiría dos utilidades peleando por la misma propiedad, y quién
 * gana ahí no lo decide el orden en que están escritas.
 */
export const eyebrowClass = "font-mono text-[10px] tracking-[0.2em] uppercase";
