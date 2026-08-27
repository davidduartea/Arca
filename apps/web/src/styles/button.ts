import { join } from "@/lib/join";

/**
 * El botón: tinta sobre papel, sin sombras y sin esquinas redondeadas.
 *
 * Devuelve una cadena de clases en vez de un componente porque lo mismo se
 * pinta sobre un `<button>`, sobre un `<a>` y sobre un `<Link>` de Next. Un
 * componente obligaría a envolver los tres o a inventar una propiedad `as`, que
 * es más máquina para el mismo resultado.
 *
 * El tono se lleva **todos** sus colores, incluidos los del hover. No es
 * casualidad: dos utilidades que tocan la misma propiedad no se resuelven por
 * el orden en que están escritas en el atributo, sino por el orden en que
 * Tailwind las emite. Repartir el color entre la base y el tono deja el
 * resultado a suerte.
 */
const BASE =
  "inline-flex cursor-pointer items-center justify-center gap-s2 border-[1.5px] leading-[1.2] no-underline transition-colors duration-[120ms] ease-[ease] disabled:cursor-not-allowed disabled:opacity-45";

const TONES = {
  /** El de acción: relleno. Uno por pantalla, o dejan de significar nada. */
  primary: "border-green bg-green text-paper hover:bg-green-light hover:text-paper",

  /**
   * El de siempre: sólo el filete.
   *
   * El `hover:text-green` no sobra — sin él, el `a:hover` general lo aclararía
   * al pasar por encima, y un botón que cambia de color de letra al rozarlo
   * parece un enlace.
   */
  outline: "border-green bg-transparent text-green hover:bg-green/6 hover:text-green",
} as const;

/** Tres tallas, y cada una nació de un sitio: la normal, la de los estados, la de la caja de recibir. */
const SIZES = {
  normal: "px-[20px] py-[10px] text-[14px]",
  small: "px-[14px] py-[7px] text-[12.5px]",
  tiny: "px-[13px] py-[6px] text-[12px]",
} as const;

export type ButtonTone = keyof typeof TONES;
export type ButtonSize = keyof typeof SIZES;

export function button({
  tone = "outline",
  size = "normal",
  className,
}: {
  tone?: ButtonTone;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return join(BASE, TONES[tone], SIZES[size], className);
}
