import Link from "next/link";

import { formatUsd } from "@/lib/money";
import type { AccountView } from "@/models/accounts/AccountView";
import type { StatementPageView } from "@/models/statements/StatementPageView";
import { ReceiveBox } from "@/modules/accounts/components/ReceiveBox";
import { BalanceAt } from "@/modules/statements/components/BalanceAt";
import { Statement } from "@/modules/statements/components/Statement";

/**
 * El extracto de una cuenta: cabecera, saldo a fecha y los movimientos.
 *
 * El saldo se enseña en grande y debajo dice de dónde sale. Es la promesa del
 * proyecto entera en una línea: no hay ninguna cifra guardada, se suma al leer.
 */
export function StatementScreen({
  account,
  firstPage,
}: {
  account: AccountView;
  firstPage: StatementPageView;
}) {
  return (
    <>
      <Link
        className="font-mono text-[10.5px] tracking-[0.04em] text-green-light no-underline"
        href="/accounts"
      >
        ← Cuentas
      </Link>

      <div className="mt-s2 flex flex-wrap items-end justify-between gap-s5">
        <div>
          <p className="font-serif text-[20px] text-ink-3">{account.name}</p>
          <h1 className="font-serif text-[clamp(38px,8vw,56px)] leading-[1.02] tabular-nums">
            {formatUsd(account.balance)}
          </h1>
          <p className="font-mono text-[10.5px] tracking-[0.04em] text-ink-4">
            derivado de los movimientos · nunca almacenado
          </p>
        </div>

        <ReceiveBox number={account.number} accountName={account.name} />
      </div>

      <img className="mt-s4 mb-[10px] w-full" src="/art/rule.svg" alt="" />

      {/* Bajo el filete y pegado a la derecha, sobre la cabecera de la tabla. */}
      <div className="mb-s4 flex justify-end">
        <BalanceAt accountId={account.id} />
      </div>

      <Statement accountId={account.id} firstPage={firstPage} openedAt={account.createdAt} />
    </>
  );
}
