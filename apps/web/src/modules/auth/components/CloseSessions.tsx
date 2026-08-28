"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { closeAllSessions } from "@/modules/auth/actions";
import { button } from "@/styles/button";

/**
 * Salir en todos los sitios, con la pregunta en el sitio del botón.
 *
 * La confirmación **no es una capa flotante**. En este sistema no hay sombras,
 * y un diálogo por encima obligaría a inventar una: la página crece hacia
 * abajo, no se oscurece nada y no hay nada que cerrar con la tecla de escape.
 *
 * El filete de la caja es uniforme y verde. El engrosado a la izquierda es el
 * de los avisos de error, y preguntar no es equivocarse.
 */
export function CloseSessions() {
  const [asking, setAsking] = useState(false);
  const question = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // El botón que tenía el foco desaparece al preguntar. Sin mover el foco a
    // la pregunta, quien navega con teclado o lector de pantalla se queda sin
    // saber qué ha pasado y con el foco al principio del documento.
    if (asking) question.current?.focus();
  }, [asking]);

  if (!asking) {
    return (
      <button
        className={button({ className: "mt-s4 w-full sm:w-auto" })}
        type="button"
        onClick={() => {
          setAsking(true);
        }}
      >
        Cerrar todas las sesiones
      </button>
    );
  }

  return (
    <div className="mt-s4 border-[1.5px] border-rule bg-paper p-s4">
      <h3 className="text-[20px] outline-none" ref={question} tabIndex={-1}>
        ¿Cerramos todas las sesiones?
      </h3>

      <div className="mt-s4 flex flex-wrap gap-s3">
        <form action={closeAllSessions}>
          <Confirm />
        </form>

        <button
          className={button()}
          type="button"
          onClick={() => {
            setAsking(false);
          }}
        >
          Dejarlo como está
        </button>
      </div>
    </div>
  );
}

/**
 * El botón que lo hace, separado para poder leer `useFormStatus`.
 *
 * Ese hook sólo informa del formulario que lo envuelve, así que tiene que vivir
 * dentro del `<form>` y no en el componente que lo declara.
 */
function Confirm() {
  const { pending } = useFormStatus();

  return (
    <button className={button({ tone: "primary" })} type="submit" disabled={pending}>
      {pending ? "Cerrando…" : "Sí, cerrar todas"}
    </button>
  );
}
