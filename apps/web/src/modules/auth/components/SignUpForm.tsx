"use client";

import { useActionState, useId, useState } from "react";

import { Notice } from "@/components/Notice";
import { PASSWORD_EXPLANATION, PASSWORD_MIN_LENGTH } from "@/models/auth/PasswordPolicy";
import { EMPTY_FORM } from "@/models/auth/FormState";
import { signUp } from "@/modules/auth/actions";
import { PasswordMeter } from "@/modules/auth/components/PasswordMeter";
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
 * Cómo se cuenta eso en pantalla lo resuelve `PasswordMeter`, que es el mismo
 * campo que se usa al cambiarla.
 */
export function SignUpForm() {
  const [state, act, pending] = useActionState(signUp, EMPTY_FORM);
  const [typed, setTyped] = useState("");

  const hintId = useId();
  const nameHintId = useId();

  return (
    <form className={authFormClass} action={act}>
      {state.error && <Notice>{state.error}</Notice>}

      {/*
        El nombre va primero, y no es orden alfabético: es lo único de esta
        pantalla que verán otras personas. Quien teclee tu número de arca antes
        de mandarte dinero lee esto para confirmar que eres tú.
      */}
      <div className={fieldClass}>
        <label className={labelClass} htmlFor="name">
          Tu nombre
        </label>
        <input
          className={inputClass}
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Ana Duarte"
          maxLength={80}
          aria-describedby={nameHintId}
          required
        />
        <span className={hintClass} id={nameHintId}>
          Es lo que verá quien te transfiera, para confirmar que eres tú.
        </span>
        {state.issues?.["name"] && <span className={hintClass}>{state.issues["name"]}</span>}
      </div>

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

        <PasswordMeter
          length={typed.length}
          hintId={hintId}
          explanation={PASSWORD_EXPLANATION}
        />
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
