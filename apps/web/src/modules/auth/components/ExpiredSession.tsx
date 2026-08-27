"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Notice } from "@/components/Notice";
import { EMPTY_FORM } from "@/models/auth/FormState";
import { signIn } from "@/modules/auth/actions";
import { altClass, authFormClass } from "@/modules/auth/styles";
import { button } from "@/styles/button";
import { fieldClass, inputClass, labelClass } from "@/styles/form";

/**
 * Ha pasado una hora.
 *
 * No es un fallo, no es un aviso de seguridad y no lleva candados ni rojo: la
 * ilustración es un reloj y la frase empieza por el tiempo.
 *
 * Tres cosas que la separan de la pantalla de acceso normal:
 *
 * **El correo ya está puesto.** La sesión no se cerró, venció. Volver a pedirlo
 * sería tratar a alguien como si acabara de llegar.
 *
 * **El botón dice a dónde vuelve.** Quien estaba a mitad de algo necesita saber
 * que no ha perdido el sitio.
 *
 * **Y nada se ha movido.** Es lo primero que uno piensa en una aplicación de
 * dinero, así que se dice antes de que lo pregunte.
 */
export function ExpiredSession({ email, next }: { email: string | null; next: string }) {
  const [state, act, pending] = useActionState(signIn, EMPTY_FORM);

  return (
    <div className="mx-auto max-w-[360px] text-center">
      <img
        className="mx-auto mb-s1 w-[62px]"
        src="/art/vig-clock.svg"
        alt=""
        width={62}
        height={62}
      />

      <h1 className="text-[23px] leading-[1.2]">Ha pasado una hora</h1>
      <p className="mx-auto mt-s2 mb-s4 max-w-[30ch] text-[13px] leading-[1.6] text-ink-2">
        Por seguridad cerramos la sesión sola después de una hora. Vuelve a entrar y sigues
        donde estabas — no se ha movido nada.
      </p>

      {/* El formulario vuelve a alinearse a la izquierda: es un formulario. */}
      <form className={`${authFormClass} text-left`} action={act}>
        <input type="hidden" name="next" value={next} />
        {email && <input type="hidden" name="email" value={email} />}

        {state.error && <Notice>{state.error}</Notice>}

        <div className={fieldClass}>
          <label className={labelClass} htmlFor="password">
            {email ? `Contraseña de ${email}` : "Correo y contraseña"}
          </label>

          {!email && (
            <input
              className={inputClass}
              name="email"
              type="email"
              autoComplete="email"
              placeholder="tu@correo.com"
              required
            />
          )}

          <input
            className={inputClass}
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
          />
        </div>

        <button
          className={button({ tone: "primary", className: "mt-s1 w-full" })}
          type="submit"
          disabled={pending}
        >
          {pending ? "Entrando…" : returnLabel(next)}
        </button>
      </form>

      <p className={altClass}>
        <Link href="/login">Entrar con otra cuenta</Link>
      </p>
    </div>
  );
}

/**
 * «Entrar y volver a la transferencia», no «Acceder».
 *
 * Un botón que dice a dónde lleva es la mitad de la promesa de que no se ha
 * perdido nada.
 */
function returnLabel(next: string): string {
  if (next.startsWith("/transfers")) return "Entrar y volver a la transferencia";
  if (next.startsWith("/deposits")) return "Entrar y volver al ingreso";
  if (next.startsWith("/accounts/")) return "Entrar y volver al extracto";

  return "Entrar y volver";
}
