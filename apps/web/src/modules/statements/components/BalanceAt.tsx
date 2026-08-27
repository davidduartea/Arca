"use client";

import { useId, useState } from "react";

import { formatUsd } from "@/lib/money";
import { getBalanceAt } from "@/modules/statements/actions";
import { button } from "@/styles/button";
import { eyebrowClass } from "@/styles/layout";

/** La respuesta y el error se ven igual: los dos son texto de máquina, en mono. */
const ANSWER = "mt-[7px] font-mono text-[12px] text-ink-2 tabular-nums";

/**
 * ¿Cuánto había el…?
 *
 * El saldo a una fecha se calcula sumando los asientos hasta ese momento — no
 * hay ninguna instantánea guardada. La respuesta sale con la hora exacta a la
 * que se preguntó, porque «el día 15» sin más es ambiguo: aquí significa el 15
 * a las 23:59.
 */
export function BalanceAt({ accountId }: { accountId: string }) {
  const [date, setDate] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const fieldId = useId();

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
    <div className="text-right">
      <label className={`${eyebrowClass} text-ink-4`} htmlFor={fieldId}>
        ¿Cuánto había el…?
      </label>

      <div className="mt-[6px] flex items-center justify-end gap-s2">
        <input
          className="border border-green/55 bg-paper px-[10px] py-[7px] font-mono text-[12.5px] text-ink tabular-nums"
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
          className={button()}
          type="button"
          onClick={() => void ask()}
          disabled={!date || asking}
        >
          {asking ? "Mirando…" : "Consultar"}
        </button>
      </div>

      {answer !== null && <p className={ANSWER}>ese día, a las 23:59 · {answer}</p>}

      {error !== null && (
        <p className={ANSWER} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
