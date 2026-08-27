import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAccount } from "@/modules/accounts/queries";
import { getStatement } from "@/modules/statements/actions";
import { StatementScreen } from "@/modules/statements/main/StatementScreen";

interface Params {
  params: Promise<{ accountId: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { accountId } = await params;
  const account = await getAccount(accountId);

  return { title: account?.name ?? "Cuenta" };
}

export default async function AccountPage({ params }: Params) {
  const { accountId } = await params;

  // Las dos lecturas van a la vez: el saldo y la primera página no dependen la
  // una de la otra, y en serie se sumarían dos viajes al servidor.
  const [account, firstPage] = await Promise.all([
    getAccount(accountId),
    getStatement(accountId).catch(() => ({ lines: [], nextCursor: null })),
  ]);

  // La API responde 404 tanto si no existe como si es de otro, y aquí se
  // mantiene: distinguirlos le diría a quien prueba identificadores cuáles
  // existen.
  if (!account) notFound();

  return <StatementScreen account={account} firstPage={firstPage} />;
}
