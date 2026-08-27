"use client";

import { useActionState, useId, useState } from "react";

import { Notice } from "@/components/Notice";
import { PASSWORD_MIN_LENGTH } from "@/models/auth/PasswordPolicy";
import { EMPTY_FORM } from "@/models/auth/FormState";
import { signUp } from "@/modules/auth/actions";
import { authFormClass } from "@/modules/auth/styles";
import { button } from "@/styles/button";
import { fieldClass, hintClass, inputClass, labelClass } from "@/styles/form";

/**
 * El registro.
 *
 * La contraseña necesita doce caracteres y **nada más**: ni mayúsculas, ni
 * símbolos, ni números obligatorios. Esas reglas producen «Password1!» una y
 * otra vez; la longitud es lo que de verdad protege.
 *
 * Por eso el contador cuenta hacia arriba y dice cuánto falta, en vez de
 * regañar por lo que falta. Y la barra mide **longitud**, no una «fuerza» que
 * nadie sabe calcular y que sólo sirve para hacer sentir mal a quien escribe
 * una frase larga y sencilla.
 */
export function SignUpForm() {
  const [state, act, pending] = useActionState(signUp, EMPTY_FORM);
  const [typed, setTyped] = useState("");

  const hintId = useId();
  const remaining = Math.max(0, PASSWORD_MIN_LENGTH - typed.length);
  const progress = Math.min(100, (typed.length / PASSWORD_MIN_LENGTH) * 100);

  return (
    <form className={authFormClass} action={act}>
      {state.error && <Notice>{state.error}</Notice>}

      <div className={fieldClass}>
        <label className={labelClass} htmlFor="email">
          Correo
        </label>
        <input
          className={inputClass}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          required
        />
        {state.issues?.["email"] && <span className={hintClass}>{state.issues["email"]}</span>}
      </div>

      <div className={fieldClass}>
        <label className={labelClass} htmlFor="password">
          Contraseña
        </label>
        <input
          className={inputClass}
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="una frase que recuerdes"
          minLength={PASSWORD_MIN_LENGTH}
          aria-describedby={hintId}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
          }}
          required
        />

        {/* El contador de la contraseña: mide longitud, no «fuerza». */}
        {typed.length > 0 && (
          <div className="flex items-center gap-s2">
            <div className="h-[4px] flex-1 overflow-hidden bg-green/14">
              <div
                className="h-full bg-green transition-[width] duration-150 ease-[ease]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="font-mono text-[11px] text-ink-3 tabular-nums">
              {Math.min(typed.length, PASSWORD_MIN_LENGTH)} / {PASSWORD_MIN_LENGTH}
            </span>
          </div>
        )}

        <span className={hintClass} id={hintId}>
          {remaining > 0 && typed.length > 0
            ? plural(remaining)
            : "Doce caracteres o más. Sin mayúsculas ni símbolos obligatorios — «caballo verde en la cocina» vale."}
        </span>
      </div>

      <button
        className={button({ tone: "primary", className: "mt-s1 w-full" })}
        type="submit"
        disabled={pending}
      >
        {pending ? "Abriendo…" : "Crear cuenta"}
      </button>
    </form>
  );
}

function plural(remaining: number): string {
  return remaining === 1 ? "Uno más y ya está." : `${remaining} más y ya está.`;
}
