import { join } from "@/lib/join";

/**
 * Cuando no hay nada que contar.
 *
 * Es el único sitio donde el ornamento puede tener gracia: la marca de agua
 * asoma por una esquina y el resto del marco se queda quieto.
 *
 * El contenido va envuelto en una capa propia, y no suelto. La marca está
 * posicionada de forma absoluta, así que sin esa capa el texto le pasaría por
 * debajo — y una rosetón del 50 % de opacidad detrás de una frase la deja
 * ilegible justo cuando más falta hace leerla.
 */
export function EmptyState({
  watermark = true,
  className,
  children,
}: {
  watermark?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={join(
        "relative overflow-hidden border border-hair-strong bg-paper px-s4 py-s5 text-center",
        className,
      )}
    >
      {watermark && (
        <img
          className="pointer-events-none absolute -top-[40px] -right-[46px] w-[190px]"
          src="/art/rosette-watermark.svg"
          alt=""
        />
      )}

      <div className="relative">{children}</div>
    </div>
  );
}
