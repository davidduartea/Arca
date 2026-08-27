import { join } from "@/lib/join";

/**
 * Aviso.
 *
 * Sin rojo de alarma. Un rechazo por fondos o unas credenciales que no cuadran
 * no son una avería del sistema: mismo tono que el resto, con un filete a la
 * izquierda para que se distinga sin gritar.
 *
 * `role="alert"` viene de serie y no como propiedad opcional. Es lo que hace
 * que un lector de pantalla lo lea al aparecer, y era justo lo que se olvidaba
 * cuando esto era una clase suelta que cada quien escribía a mano.
 */
export function Notice({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className={join(
        "border-[1.5px] border-l-4 border-ink bg-paper px-[12px] py-[10px] text-[13.5px] leading-[1.5]",
        className,
      )}
    >
      {children}
    </div>
  );
}
