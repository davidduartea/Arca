import { join } from "@/lib/join";

/**
 * La caja de los estados de sistema: no encontrado, error, y lo que venga.
 *
 * Los tres comparten estructura —viñeta de ~58 px, titular Bodoni de 20, dos
 * líneas de explicación y una salida— y por eso comparten componente. La marca
 * de agua asoma por la esquina que se le diga, nunca por detrás del texto.
 */
export function StateCard({
  mark,
  className,
  children,
}: {
  mark: "left" | "right";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={join(
        "relative mx-auto max-w-[440px] overflow-hidden border border-hair-strong bg-paper px-s4 py-s5 text-center",
        className,
      )}
    >
      <img
        className={join(
          "pointer-events-none absolute w-[140px] opacity-50",
          mark === "left" ? "-bottom-[44px] -left-[42px]" : "-top-[42px] -right-[44px]",
        )}
        src="/art/rosette-watermark.svg"
        alt=""
      />

      {/* El contenido, por encima de la marca. Sin esta capa el texto queda debajo. */}
      <div className="relative">{children}</div>
    </div>
  );
}

/** El titular y la explicación de un estado, iguales en los tres. */
export const stateTitleClass = "mt-[2px] text-[20px]";
export const stateTextClass = "mt-[7px] text-[12.5px] leading-[1.55] text-ink-2";
export const stateActionsClass = "mt-s4 flex justify-center gap-s2";
export const stateVignetteClass = "mx-auto w-[58px]";
