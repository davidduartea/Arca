"use client";

import { useId, useState } from "react";

import { join } from "@/lib/join";
import { formatUsd } from "@/lib/money";
import { getBalanceAt } from "@/modules/statements/actions";
import { formatDay } from "@/modules/statements/date";
import { button } from "@/styles/button";

/** El error es texto de máquina, como la respuesta: mono y apagado. */
const ANSWER = "mt-[7px] font-mono text-[12px] text-ink-2 tabular-nums";

/**
 * ¿Cuánto había el…?
 *
 * El saldo a una fecha se calcula sumando los asientos hasta ese momento — no
 * hay ninguna instantánea guardada. La respuesta sale con la hora exacta a la
 * que se preguntó, porque «el día 15» sin más es ambiguo: aquí significa el 15
 * a las 23:59.
 *
 * En el teléfono se pliega tras su propia pregunta y arranca cerrada. Es lo que
 * menos se usa de toda la pantalla, y desplegada se lleva dos campos y un botón
 * por delante del primer movimiento. En el escritorio no se pliega: cabe de
 * sobra en la misma línea que la cabecera de la tabla, y esconder algo que ya
 * cabe sólo añade un clic.
 */
export function BalanceAt({ accountId }: { accountId: string }) {
  const [date, setDate] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [open, setOpen] = useState(false);

  const fieldId = useId();
  const panelId = useId();

  async function ask() {
    if (!date) return;

    setAsking(true);
    setError(null);

    // Fin de ese día: quien pregunta por el 15 quiere lo que había al acabarlo.
    const result = await getBalanceAt(accountId, `${date}T23:59:59.999`);

    if ("error" in result) {
      setError(result.error);
      setAnswer(null);
    } else {
      setAnswer(formatUsd(result.balance));
    }

    setAsking(false);
  }

  return (
    <div className="nav:text-right">
      {/*
        El disparador sólo existe plegado. El signo es decorativo —lo que dice
        si está abierto o cerrado es `aria-expanded`, y leerle además «más» a
        quien no ve el signo no aclara nada.
      */}
      <button
        className="flex w-full items-center justify-between gap-s3 nav:hidden"
        type="button"
        aria-controls={panelId}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <span className="border-b border-b-green/40 text-[13.5px] text-green">
          ¿Cuánto había el…?
        </span>
        <span className="font-mono text-[13px] text-green-light" aria-hidden="true">
          {open ? "−" : "+"}
        </span>
      </button>

      <div className={join(open ? "mt-s3 block" : "hidden", "nav:mt-0 nav:block")} id={panelId}>
        {/*
          La etiqueta cambia de texto, no de sitio. Plegado la pregunta ya está
          escrita en el disparador de arriba y repetirla aquí sobraría; tendido
          no hay disparador y la pregunta tiene que estar en alguna parte.
        */}
        <label
          className="mb-[4px] block text-[11.5px] text-ink-3 nav:mb-0 nav:font-mono nav:text-[10px] nav:tracking-[0.2em] nav:text-ink-4 nav:uppercase"
          htmlFor={fieldId}
        >
          <span className="nav:hidden">Fecha</span>
          <span className="hidden nav:inline">¿Cuánto había el…?</span>
        </label>

        <div className="nav:mt-[6px] nav:flex nav:items-center nav:justify-end nav:gap-s2">
          <input
            className="w-full border-[1.5px] border-ink bg-paper px-[11px] py-[9px] font-mono text-[14px] text-ink tabular-nums nav:w-auto nav:border nav:border-green/55 nav:px-[10px] nav:py-[7px] nav:text-[12.5px]"
            id={fieldId}
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => {
              setDate(event.target.value);
              setAnswer(null);
            }}
          />
          <button
            className={button({ className: "mt-s3 w-full nav:mt-0 nav:w-auto" })}
            type="button"
            onClick={() => void ask()}
            disabled={!date || asking}
          >
            {asking ? "Mirando…" : "Consultar"}
          </button>
        </div>

        {/*
          La respuesta reusa la forma de la fila apilada: el día apagado a la
          izquierda, la cifra a la derecha. Sin «queda» — no es el saldo después
          de un movimiento, es el de un día entero.
        */}
        {answer !== null && (
          <p className="mt-s3 flex items-baseline justify-between gap-s3 border-t border-dashed border-t-green/28 pt-s2 font-mono text-ink-2 tabular-nums nav:mt-[7px] nav:block nav:border-t-0 nav:pt-0 nav:text-[12px]">
            <span className="text-[11.5px] text-ink-4 nav:hidden">
              {/* La fecha se lee en local: `new Date("2026-08-15")` es medianoche
                  UTC y en media Europa cae el día antes. */}
              {formatDay(`${date}T00:00:00`)} · 23:59
            </span>
            <span className="hidden nav:inline">ese día, a las 23:59 · </span>
            <span className="text-[14px] nav:text-[12px]">{answer}</span>
          </p>
        )}

        {error !== null && (
          <p className={ANSWER} role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
