"use server";

import { ApiError, api } from "@/lib/api";
import { firstMessage } from "@/lib/validation";
import { balanceAtQuerySchema } from "@/models/statements/BalanceAtQuery";
import type { BalanceAtView } from "@/models/statements/BalanceAtView";
import type { StatementPageView } from "@/models/statements/StatementPageView";
import { statementQuerySchema } from "@/models/statements/StatementQuery";

/**
 * Una página del extracto.
 *
 * `cursor` es opaco y se devuelve tal cual: la aplicación no lo abre ni lo
 * construye. Ese es el contrato — el día que la clave de paginación cambie en
 * el servidor, aquí no hay que tocar nada.
 *
 * El identificador **se comprueba antes de meterlo en la ruta**. Es lo que
 * separa pedir el extracto de una cuenta de pedir cualquier otra cosa: sin la
 * comprobación, un `..` dentro del identificador convierte
 * `/accounts/<id>/statement` en otra dirección de la API, servida con la sesión
 * de quien mira. Lanza en vez de contestar bonito: con la aplicación delante
 * esto no puede pasar, así que si pasa es que alguien está probando.
 */
export async function getStatement(
  accountId: string,
  cursor?: string,
): Promise<StatementPageView> {
  const parsed = statementQuerySchema.safeParse({ accountId, cursor });

  if (!parsed.success) throw new Error(firstMessage(parsed.error));

  const query = new URLSearchParams();
  if (parsed.data.cursor) query.set("cursor", parsed.data.cursor);

  const suffix = query.size > 0 ? `?${query.toString()}` : "";

  return api<StatementPageView>(
    `/accounts/${encodeURIComponent(parsed.data.accountId)}/statement${suffix}`,
  );
}

/** Cuánto había en la cuenta a una fecha. */
export async function getBalanceAt(
  accountId: string,
  at: string,
): Promise<BalanceAtView | { error: string }> {
  const parsed = balanceAtQuerySchema.safeParse({ accountId, at });

  if (!parsed.success) return { error: firstMessage(parsed.error) };

  try {
    return await api<BalanceAtView>(
      `/accounts/${encodeURIComponent(parsed.data.accountId)}/balance?at=${encodeURIComponent(
        parsed.data.at.toISOString(),
      )}`,
    );
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };

    return { error: "No se pudo consultar el saldo." };
  }
}
