"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Notice } from "@/components/Notice";
import { formatUsd } from "@/lib/money";
import type { AccountView } from "@/models/accounts/AccountView";
import { EMPTY_MOVE } from "@/models/transfers/MoveState";
import { deposit } from "@/modules/transfers/actions";
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
 * Ingresar: dinero que entra desde fuera del banco.
 *
 * Un paso y sin confirmación, al revés que la transferencia. No porque importe
 * menos, sino porque no puede dejar a nadie sin fondos: el dinero sale de la
 * cuenta del mundo exterior, que está en negativo por definición.
 *
 * Sólo deja ingresar en cuentas propias. Si dejara elegir el origen, cualquiera
 * se transferiría dinero desde la nada.
 */
export function DepositForm({ accounts }: { accounts: AccountView[] }) {
  const [state, act, pending] = useActionState(deposit, EMPTY_MOVE);
  const [toAccountId, setToAccountId] = useState(accounts[0]?.id ?? "");

  // Nace en el navegador para que un reintento traiga la misma: es lo que
  // permite a la API reconocer el duplicado en vez de ingresar dos veces.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  if (state.done) {
    return (
      <div className={doneClass}>
        <img
          className="mx-auto mb-s2 w-[52px]"
          src="/art/vig-seal.svg"
          alt=""
          width={52}
          height={52}
        />
        <h2 className="text-[22px]">Ingresado</h2>
        <p className={doneAmountClass}>+{formatUsd(state.done.amount)}</p>

        <div className={doneActionsClass}>
          <Link className={button()} href={`/accounts/${toAccountId}`}>
            Ver en el extracto
          </Link>
          <Link className={button()} href="/accounts">
            A mis cuentas
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className={moveFormClass} action={act}>
      {state.error && <Notice>{state.error}</Notice>}

      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div className={fieldClass}>
        <label className={labelClass} htmlFor="to">
          En la cuenta
        </label>
        <select
          className={inputClass}
          id="to"
          name="toAccountId"
          value={toAccountId}
          onChange={(event) => {
            setToAccountId(event.target.value);
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

      <div className={fieldClass}>
        <label className={labelClass} htmlFor="amount">
          Importe
        </label>
        <input
          className={`${inputClass} font-mono tabular-nums`}
          id="amount"
          name="amount"
          inputMode="decimal"
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
          name="description"
          placeholder="Nómina de agosto"
          maxLength={140}
        />
      </div>

      <div className={moveActionsClass}>
        <button
          className={button({ tone: "primary", className: "flex-1" })}
          type="submit"
          disabled={pending}
        >
          {pending ? "Ingresando…" : "Ingresar"}
        </button>
        <Link className={button()} href="/accounts">
          Cancelar
        </Link>
      </div>

      <p className={moveNoteClass}>
        Sin selector de divisa y sin categoría: cuenta, importe y poco más.
      </p>
    </form>
  );
}
