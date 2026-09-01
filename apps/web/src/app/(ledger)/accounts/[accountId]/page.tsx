import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getAccount } from "@/modules/accounts/queries";
import { currentUser } from "@/modules/auth/queries";
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

  // Las tres lecturas van a la vez: no dependen unas de otras, y en serie se
  // sumarían tres viajes al servidor. La de quién mira está memorizada por
  // petición, así que aquí no cuesta nada — el guardia del layout ya la hizo.
  const [account, firstPage, user] = await Promise.all([
    getAccount(accountId),
    getStatement(accountId).catch(() => ({ lines: [], nextCursor: null })),
    currentUser(),
  ]);

  // La API responde 404 tanto si no existe como si es de otro, y aquí se
  // mantiene: distinguirlos le diría a quien prueba identificadores cuáles
  // existen.
  if (!account) notFound();
  if (!user) redirect("/login");

  return <StatementScreen account={account} firstPage={firstPage} holderName={user.name} />;
}
