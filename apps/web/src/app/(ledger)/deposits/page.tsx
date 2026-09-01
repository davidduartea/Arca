import type { Metadata } from "next";

import { listOpenAccounts } from "@/modules/accounts/queries";
import { DepositScreen } from "@/modules/transfers/main/DepositScreen";

export const metadata: Metadata = { title: "Ingresar" };

export default async function DepositsPage() {
  return <DepositScreen accounts={await listOpenAccounts()} />;
}
