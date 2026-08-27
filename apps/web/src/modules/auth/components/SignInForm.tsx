"use client";

import { useActionState } from "react";

import { Notice } from "@/components/Notice";
import { EMPTY_FORM } from "@/models/auth/FormState";
import { signIn } from "@/modules/auth/actions";
import { authFormClass } from "@/modules/auth/styles";
import { button } from "@/styles/button";
import { fieldClass, inputClass, labelClass } from "@/styles/form";

/**
 * El acceso.
 *
 * El mensaje de error va **arriba y sin campo asociado**. Ni borde rojo ni
 * campo marcado: la API responde lo mismo tanto si el correo no existe como si
 * la contraseña no es esa, y marcar el campo del correo deshacía esa decisión
 * — le diría a quien lo prueba qué correos están registrados.
 */
export function SignInForm({ next = "/accounts" }: { next?: string }) {
  const [state, act, pending] = useActionState(signIn, EMPTY_FORM);

  return (
    <form className={authFormClass} action={act}>
      <input type="hidden" name="next" value={next} />

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
          autoComplete="current-password"
          required
        />
      </div>

      <button
        className={button({ tone: "primary", className: "mt-s1 w-full" })}
        type="submit"
        disabled={pending}
      >
        {pending ? "Entrando…" : "Acceder"}
      </button>
    </form>
  );
}
