"use client";

import { useEffect, useState } from "react";

import { clearDraft, readDraft, writeDraft } from "@/lib/draft";

/**
 * Un formulario que recuerda lo escrito si hay que salir y volver.
 *
 * Vive aquí y no en `lib` porque es un hook: en este proyecto Vitest corre en
 * `node` y no hay DOM con el que ejecutarlo. Lo que sí se puede probar —guardar,
 * leer, y aguantar que lo guardado sea basura— está en `lib/draft` y tiene sus
 * tests. Aquí queda sólo el cableado con React.
 */

/** Una clave por formulario: el ingreso no debe restaurar una transferencia. */
export const TRANSFER_DRAFT = "arca.draft.transfer";
export const DEPOSIT_DRAFT = "arca.draft.deposit";

export function useDraft<T extends object>(key: string, create: () => T) {
  const [draft, setDraft] = useState<T>(create);

  /**
   * Se restaura **después** de montar, y no en el valor inicial.
   *
   * En el primer render esto se está pintando en el servidor, donde no hay
   * `sessionStorage`. Si el cliente arrancara con un valor distinto al que llegó
   * en el HTML, React lo trataría como una hidratación rota. El precio es que
   * los campos aparecen vacíos un instante antes de llenarse.
   *
   * Se mezcla sobre lo que ya hay en vez de sustituirlo: así, si mañana el
   * formulario gana un campo, un borrador viejo no lo deja sin valor.
   */
  useEffect(() => {
    const saved = readDraft<T>(key);
    if (saved) setDraft((current) => ({ ...current, ...saved }));
  }, [key]);

  // Funciones flecha y no métodos abreviados: quien las usa las desestructura,
  // y un método separado de su objeto pierde el `this` que da por hecho tenerlo.
  return {
    draft,

    /** Cambia lo que se le diga y deja constancia. */
    update: (patch: Partial<T>) => {
      const next = { ...draft, ...patch };

      setDraft(next);
      writeDraft(key, next);
    },

    /** Ya no hace falta guardarlo: el movimiento salió. */
    discard: () => {
      clearDraft(key);
    },

    /** Otro movimiento desde cero, con lo que `create` devuelva ahora. */
    reset: () => {
      setDraft(create());
      clearDraft(key);
    },
  };
}
