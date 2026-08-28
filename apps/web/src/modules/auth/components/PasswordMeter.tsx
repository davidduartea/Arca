"use client";

import { hintClass } from "@/styles/form";
import { PASSWORD_MIN_LENGTH } from "@/models/auth/PasswordPolicy";

/**
 * La barra de la contraseña, y la pista que la acompaña.
 *
 * Mide **longitud**, no una «fuerza» que nadie sabe calcular y que sólo sirve
 * para hacer sentir mal a quien escribe una frase larga y sencilla. Cuenta
 * hacia arriba y dice cuánto falta, en vez de regañar por lo que falta.
 *
 * Desaparece al llegar al mínimo: a partir de ahí no mide nada — no hay grados
 * de «suficiente»— y dejarla al 100 % invitaría a leerla como una nota.
 *
 * Va en un componente porque los dos sitios donde se escribe una contraseña
 * nueva son el registro y el cambio, y son el mismo campo con el mismo
 * comportamiento. Duplicarlo garantizaba que un día dejaran de parecerse.
 */
export function PasswordMeter({
  length,
  hintId,
  explanation,
}: {
  length: number;
  hintId: string;
  /** Qué se lee cuando ya no falta nada: el porqué del mínimo. */
  explanation: string;
}) {
  const remaining = Math.max(0, PASSWORD_MIN_LENGTH - length);
  const counting = length > 0 && remaining > 0;

  return (
    <>
      {counting && (
        <div className="flex items-center gap-s2">
          <div className="h-[4px] flex-1 overflow-hidden bg-hair">
            <div
              className="h-full bg-green transition-[width] duration-150 ease-[ease]"
              style={{ width: `${(length / PASSWORD_MIN_LENGTH) * 100}%` }}
            />
          </div>
          <span className="font-mono text-[11.5px] text-ink-3 tabular-nums">
            {length} / {PASSWORD_MIN_LENGTH}
          </span>
        </div>
      )}

      <span className={hintClass} id={hintId}>
        {counting ? plural(remaining) : explanation}
      </span>
    </>
  );
}

function plural(remaining: number): string {
  return remaining === 1 ? "Uno más y ya está." : `${remaining} más y ya está.`;
}
