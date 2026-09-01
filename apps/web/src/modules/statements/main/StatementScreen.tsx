import Link from "next/link";

import { SplitNote } from "@/components/SplitNote";
import { formatUsd } from "@/lib/money";
import type { AccountView } from "@/models/accounts/AccountView";
import type { StatementPageView } from "@/models/statements/StatementPageView";
import { AccountSettings } from "@/modules/accounts/components/AccountSettings";
import { ReceiveBox } from "@/modules/accounts/components/ReceiveBox";
import { BalanceAt } from "@/modules/statements/components/BalanceAt";
import { Statement } from "@/modules/statements/components/Statement";
import { eyebrowClass } from "@/styles/layout";

/**
 * El extracto de una cuenta: cabecera, saldo a fecha y los movimientos.
 *
 * El saldo se enseña en grande y debajo dice de dónde sale. Es la promesa del
 * proyecto entera en una línea: no hay ninguna cifra guardada, se suma al leer.
 */
export function StatementScreen({
  account,
  firstPage,
  holderName,
}: {
  account: AccountView;
  firstPage: StatementPageView;

  /** El nombre de quien mira, que es el que verá quien le transfiera. */
  holderName: string;
}) {
  const empty = firstPage.lines.length === 0;
  const closed = account.closedAt !== null;

  return (
    <>
      <Link
        className="font-mono text-[10.5px] tracking-[0.04em] text-green-light no-underline"
        href="/accounts"
      >
        ← Cuentas
      </Link>

      <div className="mt-s2 flex flex-wrap items-end justify-between gap-s4 nav:gap-s5">
        <div>
          <p className="font-serif text-[18px] text-ink-3 nav:text-[20px]">{account.name}</p>
          <h1 className="font-serif text-[clamp(40px,8vw,56px)] leading-[1.02] tabular-nums">
            {formatUsd(account.balance)}
          </h1>
          <p className="font-mono text-[10.5px] leading-[1.5] tracking-[0.04em] text-ink-4">
            {/*
              Sin movimientos la frase de siempre sobra: no hay nada de donde
              derivar nada, y decirlo delante de un $0.00 suena a excusa.
            */}
            {empty ? (
              "no hay nada que sumar"
            ) : (
              <SplitNote first="derivado de los movimientos" second="nunca almacenado" />
            )}
          </p>
        </div>

        {/*
          Cerrada no se enseña el número para recibir: ya no se resuelve, y
          ofrecerlo para copiar sería mandar a alguien a un sitio sin puerta.
        */}
        {closed ? (
          <p className="max-w-[280px] border border-rule px-s3 py-s2 text-[12.5px] text-ink-2">
            <span className={`${eyebrowClass} block text-ink-3`}>Cerrada</span>
            No manda ni recibe dinero. Sus movimientos siguen aquí, y puedes volver a abrirla
            desde los ajustes.
          </p>
        ) : (
          <ReceiveBox
            number={account.number}
            accountName={account.name}
            holderName={holderName}
          />
        )}
      </div>

      {/* El filete adornado es de escritorio: en el teléfono no hay sitio que partir. */}
      <img className="mt-s4 mb-[10px] hidden w-full nav:block" src="/art/rule.svg" alt="" />

      {/*
        En el escritorio va bajo el filete y pegado a la derecha, sobre la
        cabecera de la tabla. En el teléfono ocupa el ancho y se pliega sola.
      */}
      <div className="mt-s4 mb-s4 border-t border-t-hair pt-s3 nav:mt-0 nav:flex nav:justify-end nav:border-t-0 nav:pt-0">
        <BalanceAt accountId={account.id} />
      </div>

      {/*
        El filete grueso que en la tabla pinta la cabecera de columnas. Cuando
        no hay cabecera —o no hay tabla, porque la cuenta está en blanco— tiene
        que ponerlo alguien: es lo que separa el encabezado de lo que se lista.
      */}
      <div className="border-t-[1.5px] border-t-green nav:border-t-0">
        <Statement accountId={account.id} firstPage={firstPage} openedAt={account.createdAt} />
      </div>

      {/*
        Los ajustes van al final y plegados: esta pantalla se abre cien veces
        para mirar el saldo y dos en la vida para renombrar o cerrar.
      */}
      <AccountSettings
        accountId={account.id}
        name={account.name}
        closed={closed}
        balance={account.balance}
      />
    </>
  );
}
