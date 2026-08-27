import Link from "next/link";

import { EmptyState } from "@/components/EmptyState";
import { formatUsd } from "@/lib/money";
import type { AccountView } from "@/models/accounts/AccountView";
import { OpenAccountForm } from "@/modules/accounts/components/OpenAccountForm";
import { eyebrowClass } from "@/styles/layout";

/** El panel: todas las cuentas con su saldo, y sitio para abrir otra. */
export function AccountsScreen({ accounts }: { accounts: AccountView[] }) {
  if (accounts.length === 0) return <FirstAccount />;

  return (
    <>
      <div className="mb-s4 flex flex-wrap items-baseline justify-between gap-s4">
        <h1 className="text-[27px]">Mis cuentas</h1>
      </div>

      {/* Filete grueso: separa secciones. La fina, discontinua, separa filas. */}
      <div className="border-t-[1.5px] border-t-rule">
        {accounts.map((account) => (
          <Link
            className="flex items-baseline justify-between gap-s4 border-b border-dashed border-b-green/28 py-[14px] text-inherit no-underline hover:bg-green/[3.5%] hover:text-inherit"
            key={account.id}
            href={`/accounts/${account.id}`}
          >
            <span className="text-[15px]">{account.name}</span>
            {/*
              Saldo cero es un estado normal y se escribe $0.00, no «sin fondos»
              ni un hueco: la cuenta existe y su saldo es exacto.
            */}
            <span className="font-serif text-[22px] whitespace-nowrap tabular-nums">
              {formatUsd(account.balance)}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-s6">
        <p className={`${eyebrowClass} text-ink-4`}>Abrir otra</p>
        <OpenAccountForm />
      </div>
    </>
  );
}

/** Recién registrado: todavía no hay nada que contar. */
function FirstAccount() {
  return (
    <div className="mx-auto max-w-[440px]">
      {/* Sin marca de agua: aquí el ornamento es la viñeta del arca, y dos en la
          misma caja compiten entre sí. */}
      <EmptyState watermark={false}>
        <img
          className="mx-auto mb-s2 w-[74px]"
          src="/art/vig-arca.svg"
          alt=""
          width={74}
          height={74}
        />
        {/*
          30 px y no los 20 de los demás estados vacíos: la regla que dimensiona
          esos titulares apuntaba a `h2`, y aquí el titular es un `h1` porque es
          el único de la página. Se conserva tal cual salía antes de Tailwind.
        */}
        <h1 className="text-[30px]">Todavía no hay nada que contar</h1>
        <p className="mb-s4 text-[13px] text-ink-3">
          Abre tu primera cuenta: sólo necesita un nombre.
        </p>
      </EmptyState>

      <div className="mt-s5">
        <OpenAccountForm autoFocus />
      </div>
    </div>
  );
}
