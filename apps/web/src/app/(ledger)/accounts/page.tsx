import type { Metadata } from "next";

import { AccountsScreen } from "@/modules/accounts/main/AccountsScreen";
import { listAccounts } from "@/modules/accounts/queries";

export const metadata: Metadata = { title: "Mis cuentas" };

export default async function AccountsPage() {
  return <AccountsScreen accounts={await listAccounts()} />;
}
