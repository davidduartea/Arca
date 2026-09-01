import type { Metadata } from "next";

import { listOpenAccounts } from "@/modules/accounts/queries";
import { TransferScreen } from "@/modules/transfers/main/TransferScreen";

export const metadata: Metadata = { title: "Transferir" };

export default async function TransfersPage() {
  return <TransferScreen accounts={await listOpenAccounts()} />;
}
