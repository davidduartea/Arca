import Link from "next/link";

import { EmptyState } from "@/components/EmptyState";
import type { AccountView } from "@/models/accounts/AccountView";
import { TransferForm } from "@/modules/transfers/components/TransferForm";
import { moveHeadingClass, movePageClass } from "@/modules/transfers/styles";
import { button } from "@/styles/button";

/** Mandar dinero a otra arca. Sin cuentas propias no hay de dónde sacarlo. */
export function TransferScreen({ accounts }: { accounts: AccountView[] }) {
  return (
    <div className={movePageClass}>
      <h1 className={moveHeadingClass}>Transferir</h1>

      {accounts.length === 0 ? <NoAccounts /> : <TransferForm accounts={accounts} />}
    </div>
  );
}

function NoAccounts() {
  return (
    <EmptyState>
      <h2 className="mb-s1 text-[20px]">Aún no hay de dónde sacar</h2>
      <p className="mb-s4 text-[13px] text-ink-3">Abre una cuenta antes de mover dinero.</p>
      <Link className={button({ tone: "primary" })} href="/accounts">
        Abrir una cuenta
      </Link>
    </EmptyState>
  );
}
