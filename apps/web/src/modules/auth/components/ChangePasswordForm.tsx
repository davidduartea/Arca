"use client";

import { useActionState, useEffect, useId, useState } from "react";

import { Notice } from "@/components/Notice";
import { EMPTY_FORM } from "@/models/auth/FormState";
import { PASSWORD_EXPLANATION, PASSWORD_MIN_LENGTH } from "@/models/auth/PasswordPolicy";
import { changePassword } from "@/modules/auth/actions";
import { PasswordMeter } from "@/modules/auth/components/PasswordMeter";
import { button } from "@/styles/button";
import { fieldClass, hintClass, inputClass, labelClass } from "@/styles/form";

/**
 * Cambiar la contraseña.
 *
 * Los dos campos van controlados porque el formulario decide qué se conserva
 * después de enviarlo, y eso no se puede dejar al navegador: si la actual no
 * era la suya, la nueva se queda escrita —volver a teclear una frase larga por
 * un error en el otro campo es un castigo— y la actual se vacía, porque es la
 * que estaba mal.
 */
export function ChangePasswordForm() {
  const [state, act, pending] = useActionState(changePassword, EMPTY_FORM);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  const hintId = useId();

  useEffect(() => {
    // Cada envío devuelve un objeto nuevo, así que esto corre una vez por
    // respuesta y no en cada render.
    if (state.ok) {
      setCurrent("");
      setNext("");
    } else if (state.error) {
      setCurrent("");
    }
  }, [state]);

  return (
    <form className="mt-s4 flex max-w-[420px] flex-col gap-s4" action={act}>
      {state.error && <Notice>{state.error}</Notice>}

      {/*
        El acuse va con el mismo aviso que los fallos, y no en otra tinta. No
        hay verde de «éxito» en este sistema: lo que cambia es lo que dice.
      */}
      {state.ok && (
        <Notice>Hecho. Las demás sesiones se han cerrado; en ésta sigues dentro.</Notice>
      )}

      <div className={fieldClass}>
        <label className={labelClass} htmlFor="currentPassword">
          Contraseña actual
        </label>
        <input
          className={inputClass}
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => {
            setCurrent(event.target.value);
          }}
          required
        />
        <span className={hintClass}>Para confirmar que eres tú.</span>
      </div>

      <div className={fieldClass}>
        <label className={labelClass} htmlFor="newPassword">
          Contraseña nueva
        </label>
        <input
          className={inputClass}
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          aria-describedby={hintId}
          value={next}
          onChange={(event) => {
            setNext(event.target.value);
          }}
          required
        />
        <PasswordMeter
          length={next.length}
          hintId={hintId}
          explanation={PASSWORD_EXPLANATION}
        />
      </div>

      <div>
        {/*
          Ancho completo hasta 640 px y natural por encima, que es lo que piden
          los tableros de escritorio y de móvil. Es el primer punto de ruptura
          del proyecto: hasta ahora todo se resolvía con `flex-wrap` y anchos
          máximos, y aquí no hay forma — un botón no se pliega.
        */}
        <button
          className={button({ tone: "primary", className: "w-full sm:w-auto" })}
          type="submit"
          disabled={pending}
        >
          {pending ? "Cambiando…" : "Cambiar la contraseña"}
        </button>

        <p className="mt-s3 text-[11.5px] leading-[1.6] text-ink-3">
          Al cambiarla se cerrarán todas las sesiones, incluida ésta. Volverás a entrar aquí sin
          hacer nada.
        </p>
      </div>
    </form>
  );
}
