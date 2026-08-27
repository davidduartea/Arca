"use client";

import { useEffect, useId, useState } from "react";

import { groupWhileTyping, readAccountNumber } from "@/lib/account-number";
import type { Destination } from "@/models/transfers/Destination";
import { lookupAccount } from "@/modules/accounts/actions";
import { fieldClass, hintClass, labelClass } from "@/styles/form";

/**
 * El campo del número de arca.
 *
 * Hace tres cosas que un `<input>` a secas no hace:
 *
 * **Agrupa mientras se teclea.** Cuatro y cuatro y cuatro, como una tarjeta.
 *
 * **Comprueba el dígito de control en el navegador.** Un número mal copiado se
 * ve aquí, sin preguntarle nada a nadie. Y el mensaje dice lo que suele ser —
 * una cifra cambiada de sitio — en vez de un «no válido» genérico.
 *
 * **Resuelve el nombre al completar la última cifra, no antes.** Sólo se
 * consulta un número que ya pasó el dígito de control: así el servidor no ve
 * los tanteos de alguien tecleando.
 */
export function ArcaNumberField({
  value,
  onChange,
  onDestination,
}: {
  value: string;
  onChange: (typed: string) => void;
  onDestination: (destination: Destination) => void;
}) {
  const fieldId = useId();
  const hintId = useId();
  const [destination, setDestination] = useState<Destination>({ kind: "incomplete" });

  const state = readAccountNumber(value);

  useEffect(() => {
    if (state.kind === "incomplete") {
      setDestination({ kind: "incomplete" });
      return;
    }

    if (state.kind === "impossible") {
      setDestination({ kind: "impossible" });
      return;
    }

    const number = state.number;
    let current = true;

    setDestination({ kind: "checking", number });

    void lookupAccount(number)
      .then((found) => {
        // Si mientras tanto se ha seguido tecleando, esta respuesta ya no vale.
        if (!current) return;

        setDestination(
          found ? { kind: "found", number, name: found.name } : { kind: "unknown", number },
        );
      })
      .catch(() => {
        if (current) setDestination({ kind: "unknown", number });
      });

    return () => {
      current = false;
    };
  }, [state.kind, state.kind === "valid" ? state.number : ""]);

  useEffect(() => {
    onDestination(destination);
  }, [destination, onDestination]);

  return (
    <div className={fieldClass}>
      <label className={labelClass} htmlFor={fieldId}>
        Número de arca
      </label>

      {/*
        El prefijo va impreso dentro del campo, no se teclea.
        Sirve para reconocer el número pegado en un chat; escribirlo sería
        trabajo de más para algo que es siempre igual.

        El contorno del foco lo lleva la caja entera y no el `<input>`, que ya
        no tiene filete propio: si lo llevara él, se dibujaría por dentro del
        marco y el prefijo se quedaría fuera de lo enfocado.
      */}
      <div className="flex items-center border-[1.5px] border-ink bg-paper pl-[11px] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-green">
        <span
          className="flex-none font-mono text-[10.5px] tracking-[0.14em] text-ink-4"
          aria-hidden="true"
        >
          ARCA
        </span>
        <input
          className="w-full border-0 py-[9px] pr-[11px] pl-[8px] font-mono text-[14px] tracking-[0.06em] text-ink tabular-nums placeholder:text-ink-4 focus-visible:outline-none"
          id={fieldId}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(event) => {
            onChange(groupWhileTyping(event.target.value));
          }}
          placeholder="0000 0000 0000"
          aria-describedby={hintId}
          aria-invalid={destination.kind === "impossible" || destination.kind === "unknown"}
          required
        />
      </div>

      <Answer destination={destination} hintId={hintId} />
    </div>
  );
}

function Answer({ destination, hintId }: { destination: Destination; hintId: string }) {
  if (destination.kind === "incomplete") {
    return (
      <span className={hintClass} id={hintId}>
        Doce cifras. Pega con guiones o espacios, da igual.
      </span>
    );
  }

  if (destination.kind === "impossible") {
    return (
      <span className={hintClass} id={hintId} role="alert">
        Ese número no puede existir — repasa las cifras. Suele ser una cambiada de sitio.
      </span>
    );
  }

  if (destination.kind === "checking") {
    return (
      <span className={hintClass} id={hintId}>
        Buscando…
      </span>
    );
  }

  if (destination.kind === "unknown") {
    return (
      <span className={hintClass} id={hintId} role="alert">
        No encontramos ninguna arca con ese número. Comprueba con quien te lo dio.
      </span>
    );
  }

  // Encontrado: el rombo y el nombre. La confirmación de que el número es ése.
  return (
    <span
      className="flex items-center gap-[7px] pt-s1 text-[12.5px] text-ink"
      id={hintId}
      role="status"
    >
      <img
        className="w-[20px] flex-none"
        src="/art/lozenge.svg"
        alt=""
        width={20}
        height={10}
      />
      {destination.name}
    </span>
  );
}
