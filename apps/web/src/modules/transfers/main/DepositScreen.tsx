import Link from "next/link";

import { EmptyState } from "@/components/EmptyState";
import type { AccountView } from "@/models/accounts/AccountView";
import { DepositForm } from "@/modules/transfers/components/DepositForm";
import { moveHeadingClass, movePageClass } from "@/modules/transfers/styles";
import { button } from "@/styles/button";

/** Dinero que llega de fuera del banco. La explicación va antes del formulario. */
export function DepositScreen({ accounts }: { accounts: AccountView[] }) {
  return (
    <div className={movePageClass}>
      <h1 className={moveHeadingClass}>Ingresar</h1>
      <p className="mb-s4 text-[13px] leading-[1.5] text-ink-3">
        Simula dinero que llega de fuera del banco — una nómina, una transferencia recibida. En
        un banco de verdad esto no lo pide el cliente: lo produce quien manda el dinero.
      </p>

      {accounts.length === 0 ? <NoAccounts /> : <DepositForm accounts={accounts} />}
    </div>
  );
}

function NoAccounts() {
  return (
    <EmptyState>
      <h2 className="mb-s1 text-[20px]">Aún no hay dónde ingresar</h2>
      <p className="mb-s4 text-[13px] text-ink-3">Abre una cuenta primero.</p>
      <Link className={button({ tone: "primary" })} href="/accounts">
        Abrir una cuenta
      </Link>
    </EmptyState>
  );
}
