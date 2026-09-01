"use client";

import { useActionState, useId, useState } from "react";

import { Notice } from "@/components/Notice";
import { EMPTY_FORM } from "@/models/auth/FormState";
import { changeName } from "@/modules/auth/actions";
import { button } from "@/styles/button";
import { fieldClass, hintClass, inputClass, labelClass } from "@/styles/form";

/**
 * Cambiar el nombre.
 *
 * Existe por una deuda concreta: a las cuentas abiertas antes de que hubiera
 * nombre se les puso la parte del correo anterior a la arroba, y un nombre que
 * escribió la máquina y no se puede corregir es peor que ninguno.
 *
 * Sin pedir la contraseña, a diferencia del formulario de al lado. Ahí se pide
 * porque un token robado no debe poder quedarse con la cuenta; aquí no hay nada
 * que quitarle a nadie, y pedirla trataría un cambio de etiqueta como si fuera
 * un cambio de llave.
 *
 * El campo arranca con lo que hay puesto, no vacío: casi siempre se viene a
 * corregir un nombre, no a escribir uno nuevo desde cero.
 */
export function ChangeNameForm({ name }: { name: string }) {
  const [state, act, pending] = useActionState(changeName, EMPTY_FORM);
  const [typed, setTyped] = useState(name);

  const hintId = useId();

  // El nombre nuevo llega como propiedad cuando el servidor repinta. Mismo
  // patrón que en el extracto: `useState` no se entera de una propiedad nueva.
  const [rendered, setRendered] = useState(name);
  if (rendered !== name) {
    setRendered(name);
    setTyped(name);
  }

  const unchanged = typed.trim() === name || typed.trim() === "";

  return (
    <form action={act}>
      {state.error && <Notice className="mb-s3">{state.error}</Notice>}

      <div className="mt-s4 flex items-end gap-s3">
        <div className={`${fieldClass} flex-1`}>
          <label className={labelClass} htmlFor="person-name">
            Nombre
          </label>
          <input
            className={inputClass}
            id="person-name"
            name="name"
            type="text"
            autoComplete="name"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
            maxLength={80}
            aria-describedby={hintId}
            required
          />
        </div>

        <button className={button()} type="submit" disabled={pending || unchanged}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {/*
        «Guardado.» sólo mientras lo guardado sigue siendo lo que se ve en el
        campo: en cuanto se vuelve a escribir, la confirmación dejaría de
        corresponder a lo que hay delante.
      */}
      <span className={hintClass} id={hintId}>
        {state.issues?.["name"] ??
          (state.ok && unchanged
            ? "Guardado."
            : "Es lo que ve quien te transfiere, antes de confirmar.")}
      </span>
    </form>
  );
}
