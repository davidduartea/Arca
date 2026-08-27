"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Notice } from "@/components/Notice";
import { formatAccountNumber } from "@/lib/account-number";
import { dollarsToCents, formatUsd } from "@/lib/money";
import type { AccountView } from "@/models/accounts/AccountView";
import type { Destination } from "@/models/transfers/Destination";
import { EMPTY_MOVE } from "@/models/transfers/MoveState";
import { transfer } from "@/modules/transfers/actions";
import { ArcaNumberField } from "@/modules/transfers/components/ArcaNumberField";
import {
  doneActionsClass,
  doneAmountClass,
  doneClass,
  moveActionsClass,
  moveFormClass,
  moveNoteClass,
} from "@/modules/transfers/styles";
import { button } from "@/styles/button";
import { fieldClass, inputClass, labelClass } from "@/styles/form";

/**
 * Transferir, en dos pasos.
 *
 * La confirmación no es burocracia: **una vez hecho no se puede borrar**. Un
 * error se arregla con una anulación, que deja las dos líneas en el extracto
 * para siempre. Enseñar antes cuánto queda es más barato que explicarlo
 * después.
 */
export function TransferForm({ accounts }: { accounts: AccountView[] }) {
  const [state, act, pending] = useActionState(transfer, EMPTY_MOVE);
  const [confirming, setConfirming] = useState(false);

  /**
   * La clave de idempotencia.
   *
   * Nace aquí, en el navegador, y **sobrevive a los reintentos**: si la red se
   * cae y se vuelve a enviar, va la misma clave y la API devuelve el movimiento
   * original en vez de cobrar dos veces. Generarla en el servidor la haría
   * inútil — cada reintento traería una distinta y no habría nada que
   * reconocer.
   *
   * Sólo se renueva al empezar un movimiento nuevo.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id ?? "");
  const [toNumber, setToNumber] = useState("");
  const [destination, setDestination] = useState<Destination>({ kind: "incomplete" });
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const source = accounts.find((account) => account.id === fromAccountId);

  if (state.done) {
    return (
      <Done
        amount={state.done.amount}
        accountId={fromAccountId}
        onAgain={() => {
          setConfirming(false);
          setAmount("");
          setToNumber("");
          setDestination({ kind: "incomplete" });
          setDescription("");
          // Movimiento nuevo, clave nueva: si no, el segundo se tomaría por un
          // reintento del primero y la API devolvería aquél sin mover nada.
          setIdempotencyKey(crypto.randomUUID());
        }}
      />
    );
  }

  if (confirming && source) {
    return (
      <form className={moveFormClass} action={act}>
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <input type="hidden" name="fromAccountId" value={fromAccountId} />
        <input
          type="hidden"
          name="toAccountNumber"
          value={destination.kind === "found" ? destination.number : ""}
        />
        <input type="hidden" name="amount" value={amount} />
        <input type="hidden" name="description" value={description} />

        <Problem state={state} />

        {/* La confirmación: el importe en grande, y qué queda después. */}
        <p className="text-[13px] text-ink-3">Vas a mover</p>
        <p className="font-serif text-[34px] leading-none tabular-nums">{preview(amount)}</p>

        <dl className="grid grid-cols-[auto_1fr] gap-x-s4 gap-y-[5px] text-[12.5px]">
          <dt className="text-ink-3">Desde</dt>
          <dd className="text-right wrap-anywhere">{source.name}</dd>

          <dt className="text-ink-3">Hacia</dt>
          <dd className="text-right wrap-anywhere">
            {destination.kind === "found" ? destination.name : "—"}
            {/* El nombre manda; el número va debajo, para poder cotejarlo. */}
            <span className="block font-mono text-[11px] tracking-[0.05em] text-ink-4 tabular-nums">
              {destination.kind === "found" ? formatAccountNumber(destination.number) : ""}
            </span>
          </dd>

          <dt className="text-ink-3">Quedará</dt>
          <dd className="text-right font-mono wrap-anywhere tabular-nums">
            {remaining(source.balance, amount)}
          </dd>
        </dl>

        <p className={`${moveNoteClass} border-t border-t-hair pt-s3`}>
          Una vez hecho no se puede borrar. Un error se arregla con una anulación, y las dos
          líneas se quedan en el extracto.
        </p>

        <div className={moveActionsClass}>
          <button
            className={button({ tone: "primary", className: "flex-1" })}
            type="submit"
            disabled={pending}
          >
            {pending ? "Moviendo…" : "Transferir"}
          </button>
          <button
            className={button()}
            type="button"
            onClick={() => {
              setConfirming(false);
            }}
            disabled={pending}
          >
            Volver
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      className={moveFormClass}
      onSubmit={(event) => {
        event.preventDefault();
        setConfirming(true);
      }}
    >
      <Problem state={state} />

      <div className={fieldClass}>
        <label className={labelClass} htmlFor="from">
          Desde
        </label>
        <select
          className={inputClass}
          id="from"
          value={fromAccountId}
          onChange={(event) => {
            setFromAccountId(event.target.value);
          }}
          required
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} · {formatUsd(account.balance)}
            </option>
          ))}
        </select>
      </div>

      {/* Sin destinatarios guardados: el número se escribe o se pega cada vez. */}
      <ArcaNumberField value={toNumber} onChange={setToNumber} onDestination={setDestination} />

      <div className={fieldClass}>
        <label className={labelClass} htmlFor="amount">
          Importe
        </label>
        <input
          className={`${inputClass} font-mono tabular-nums`}
          id="amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
          }}
          placeholder="0.00"
          required
        />
      </div>

      <div className={fieldClass}>
        <label className={labelClass} htmlFor="description">
          Descripción <span className="opacity-60">(opcional)</span>
        </label>
        <input
          className={inputClass}
          id="description"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
          placeholder="Alquiler de septiembre"
          maxLength={140}
        />
      </div>

      <div className={moveActionsClass}>
        <button
          className={button({ tone: "primary", className: "flex-1" })}
          type="submit"
          disabled={destination.kind !== "found"}
        >
          Continuar
        </button>
        <Link className={button()} href="/accounts">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

/**
 * El rechazo por fondos, con sus números.
 *
 * No es una avería: mismo tono que el resto, sin rojo de alarma. Y dice cuánto
 * hay, cuánto se pedía y cuánto falta, para no tener que ir a mirarlo a otra
 * pantalla.
 */
function Problem({
  state,
}: {
  state: {
    error?: string;
    shortfall?: { available: string; requested: string; missing: string };
  };
}) {
  if (!state.error) return null;

  return (
    <Notice>
      <span>{state.error}</span>

      {state.shortfall && (
        <>
          <dl className="mt-s2 grid grid-cols-[auto_1fr] gap-x-s3 gap-y-[2px] text-[12.5px]">
            <dt className="text-ink-3">Disponible</dt>
            <dd className="text-right font-mono tabular-nums">{state.shortfall.available}</dd>

            <dt className="text-ink-3">Pedías</dt>
            <dd className="text-right font-mono tabular-nums">{state.shortfall.requested}</dd>

            <dt className="text-ink-3">Faltan</dt>
            <dd className="text-right font-mono font-semibold tabular-nums">
              {state.shortfall.missing}
            </dd>
          </dl>

          <p className={`${moveNoteClass} mt-s2`}>
            Nada se ha movido. Ningún asiento se ha escrito.
          </p>
        </>
      )}
    </Notice>
  );
}

function Done({
  amount,
  accountId,
  onAgain,
}: {
  amount: string;
  accountId: string;
  onAgain: () => void;
}) {
  return (
    <div className={doneClass}>
      <img
        className="mx-auto mb-s2 w-[52px]"
        src="/art/vig-seal.svg"
        alt=""
        width={52}
        height={52}
      />
      <h2 className="text-[22px]">Hecho</h2>
      <p className={doneAmountClass}>−{formatUsd(amount)}</p>

      <div className={doneActionsClass}>
        <Link className={button()} href={`/accounts/${accountId}`}>
          Ver en el extracto
        </Link>
        <button className={button()} type="button" onClick={onAgain}>
          Otra más
        </button>
      </div>
    </div>
  );
}

/** Lo que se escribió, ya en el formato del libro. Si no se entiende, tal cual. */
function preview(typed: string): string {
  try {
    return formatUsd(dollarsToCents(typed));
  } catch {
    return typed;
  }
}

function remaining(balance: string, typed: string): string {
  try {
    return formatUsd((BigInt(balance) - BigInt(dollarsToCents(typed))).toString());
  } catch {
    return "—";
  }
}
