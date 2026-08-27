import "server-only";

import { ApiError, api } from "@/lib/api";
import { accountIdSchema } from "@/models/accounts/AccountId";
import type { AccountView } from "@/models/accounts/AccountView";

/**
 * Lecturas de cuentas, **sin** `"use server"`.
 *
 * Sólo las llaman componentes de servidor, así que no hay motivo para
 * publicarlas como endpoints. Ver `auth.queries.ts` para el razonamiento.
 */

/** Mis cuentas, con su saldo derivado. */
export async function listAccounts(): Promise<AccountView[]> {
  const { accounts } = await api<{ accounts: AccountView[] }>("/accounts");

  return accounts;
}

/**
 * Una cuenta mía.
 *
 * La API responde 404 tanto si no existe como si es de otro, y aquí se
 * mantiene: devolver algo distinto en cada caso diría, a quien vaya probando
 * identificadores, cuáles existen. Un identificador con mala forma entra por la
 * misma puerta.
 *
 * Se comprueba aunque venga de un parámetro de ruta. Next decodifica el
 * segmento antes de entregarlo, así que un `%2F` en la barra de direcciones
 * llega aquí convertido en una barra de verdad — y de ahí a otra dirección de
 * la API hay un solo paso.
 */
export async function getAccount(accountId: string): Promise<AccountView | null> {
  if (!accountIdSchema.safeParse(accountId).success) return null;

  try {
    return await api<AccountView>(`/accounts/${encodeURIComponent(accountId)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;

    throw error;
  }
}
