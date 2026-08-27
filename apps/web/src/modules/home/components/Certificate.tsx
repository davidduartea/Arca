import { eyebrowClass } from "@/styles/layout";

/**
 * El extracto de muestra, dentro de un marco de certificado.
 *
 * Los importes son fijos y a propósito: es una ilustración de qué aspecto tiene
 * el libro, no datos de nadie. La última línea es una anulación, que es la
 * idea más difícil de explicar con palabras y la más fácil de enseñar.
 *
 * Es la única pieza grande de la portada — dos ya sería un billete falso.
 */
export function Certificate() {
  return (
    <div className="relative overflow-hidden border border-green bg-paper px-[22px] pt-s5 pb-[20px]">
      <Corner className="-top-px -left-px" />
      <Corner className="-top-px -right-px -scale-x-100" />
      <Corner className="-bottom-px -left-px -scale-y-100" />
      <Corner className="-right-px -bottom-px -scale-100" />

      <img
        className="pointer-events-none absolute -bottom-[48px] -left-[42px] w-[190px] opacity-[0.55]"
        src="/art/rosette-watermark.svg"
        alt=""
      />

      {/* Todo lo impreso, por encima de las esquinas y de la marca de agua. */}
      <div className="relative">
        <div className="text-center">
          <p className={`${eyebrowClass} text-green-light`}>Extracto · agosto 2026</p>
          <p className="mt-s3 font-serif text-[19px] text-ink-2">Cuenta corriente</p>
          <p className="font-serif text-[clamp(34px,7vw,44px)] leading-[1.05]">$1,250.00</p>
          <p className="mt-[2px] font-mono text-[10.5px] text-ink-4">
            derivado de 34 movimientos
          </p>
        </div>

        <img className="mx-auto mt-s3 mb-[10px] w-[78%]" src="/art/rule.svg" alt="" />

        <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-s4 gap-y-[9px] text-[13px]">
          <span>Nómina de agosto</span>
          <Amount incoming>+$3,000.00</Amount>

          <span>Alquiler</span>
          <Amount>−$1,100.00</Amount>

          <span>Cena del viernes</span>
          <Amount>−$48.50</Amount>

          <span className="text-ink-2">Anulación de «Cena del viernes»</span>
          <Amount incoming>+$48.50</Amount>
        </div>

        <div className="mt-s4 flex items-center justify-between gap-s3 border-t border-t-green/30 pt-s3">
          <span className="font-mono text-[9.5px] tracking-[0.1em] text-ink-4 uppercase">
            Sin categorías · sin borrar
          </span>
          <img
            className="h-[38px] w-[38px]"
            src="/art/vig-seal.svg"
            alt=""
            width={38}
            height={38}
          />
        </div>
      </div>
    </div>
  );
}

/** Las cuatro esquinas de torno: el mismo dibujo, volteado. */
function Corner({ className }: { className: string }) {
  return (
    <img
      className={`pointer-events-none absolute h-[54px] w-[54px] ${className}`}
      src="/art/corner.svg"
      alt=""
    />
  );
}

/** Lo que entra pesa un poco más. Ni una gota de color. */
function Amount({ incoming = false, children }: { incoming?: boolean; children: string }) {
  return (
    <span
      className={`text-right font-mono whitespace-nowrap tabular-nums ${incoming ? "font-medium" : ""}`}
    >
      {children}
    </span>
  );
}
