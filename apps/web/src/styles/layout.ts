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
 * Etiqueta de sección: mono, versalitas, muy espaciada.
 *
 * Va sin color a propósito, y cada sitio pone el suyo —`text-ink-4` en el libro,
 * `text-green-light` sobre el certificado—. Si trajera uno de fábrica, quien lo
 * cambiara escribiría dos utilidades peleando por la misma propiedad, y quién
 * gana ahí no lo decide el orden en que están escritas.
 */
export const eyebrowClass = "font-mono text-[10px] tracking-[0.2em] uppercase";
