"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Notice } from "@/components/Notice";
import { EMPTY_FORM } from "@/models/auth/FormState";
import { openAccount } from "@/modules/accounts/actions";
import { button } from "@/styles/button";
import { fieldClass, inputClass, labelClass } from "@/styles/form";

/**
 * Abrir una cuenta: sólo pide un nombre.
 *
 * No hay tipo, ni moneda, ni saldo inicial. El tipo lo decide el servidor —
 * si el cliente pudiera elegirlo, cualquiera abriría una cuenta de sistema y se
 * transferiría dinero desde la nada.
 */
export function OpenAccountForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const [state, act, pending] = useActionState(openAccount, EMPTY_FORM);
  const [name, setName] = useState("");
  const input = useRef<HTMLInputElement>(null);

  // Al abrirse una cuenta, el campo se vacía y vuelve a tomar el foco: quien
  // abre dos seguidas no tiene que ir a buscarlo con el ratón.
  //
  // La condición es `state.ok`, que la acción devuelve al terminar bien, y no
  // «ha dejado de enviar y no hay error»: eso también sería cierto antes del
  // primer envío, y el campo se vaciaría mientras alguien escribe.
  useEffect(() => {
    if (state.ok) {
      setName("");
      input.current?.focus();
    }
  }, [state]);

  return (
    <form action={act}>
      {state.error && <Notice className="mb-s3">{state.error}</Notice>}

      {/* El campo se lleva el ancho que sobre; el botón, el que necesite. */}
      <div className="mt-s5 flex items-end gap-s3">
        <div className={`${fieldClass} flex-1`}>
          <label className={labelClass} htmlFor="account-name">
            Nombre
          </label>
          <input
            className={inputClass}
            id="account-name"
            name="name"
            ref={input}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            placeholder="Ahorro para el viaje"
            maxLength={80}
            autoFocus={autoFocus}
            required
          />
        </div>

        <button
          className={button({ tone: "primary" })}
          type="submit"
          disabled={pending || name.trim() === ""}
        >
          {pending ? "Abriendo…" : "Abrir"}
        </button>
      </div>
    </form>
  );
}
