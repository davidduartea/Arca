import Link from "next/link";

/**
 * La marca: el símbolo y la palabra.
 *
 * Vive aparte porque la pintan las dos barras —la del libro y la pública— y
 * una de ellas es de cliente. Un componente sin estado ni datos de servidor
 * puede importarse desde los dos lados sin partirse en dos copias.
 *
 * Encoge en el teléfono: 24 px y 19 px frente a 28 y 23. La cabecera es lo
 * único que se ve antes de la página, y a 390 px una marca de tamaño de
 * escritorio se come el sitio de las tres rayas.
 *
 * El `alt` va vacío a propósito: el símbolo repite lo que la palabra de al lado
 * ya dice, y un lector de pantalla que lea «Arca Arca» no ayuda a nadie.
 */
export function Brand({ href }: { href: string }) {
  return (
    <Link
      className="flex items-center gap-[9px] text-paper no-underline nav:gap-[11px]"
      href={href}
    >
      <img
        className="h-[24px] w-[24px] nav:h-[28px] nav:w-[28px]"
        src="/art/symbol-a-light.svg"
        alt=""
        width={28}
        height={28}
      />
      <span className="font-serif text-[19px] leading-none tracking-[0.07em] nav:text-[23px]">
        Arca
      </span>
    </Link>
  );
}
