"use server";

import { revalidatePath } from "next/cache";

import { ApiError, api } from "@/lib/api";
import { text } from "@/lib/form";
import { firstMessage } from "@/lib/validation";
import { accountIdSchema } from "@/models/accounts/AccountId";
import { accountNumberSchema } from "@/models/accounts/AccountNumber";
import type { AccountView } from "@/models/accounts/AccountView";
import { openAccountSchema } from "@/models/accounts/OpenAccountInput";
import { renameAccountSchema } from "@/models/accounts/RenameAccountInput";
import type { FormState } from "@/models/auth/FormState";

export async function openAccount(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = openAccountSchema.safeParse({ name: text(form, "name") });

  if (!parsed.success) return { error: firstMessage(parsed.error) };

  try {
    await api<AccountView>("/accounts", { method: "POST", body: { name: parsed.data.name } });
  } catch (error) {
    if (error instanceof ApiError) return { error: error.message };

    return { error: "No se pudo abrir la cuenta. Inténtalo otra vez." };
  }

  // El saldo se deriva en cada lectura, así que la lista tiene que volver a
  // pedirse: si Next sirviera la anterior, la cuenta nueva no aparecería.
  revalidatePath("/accounts");

  return { ok: true };
}

/**
 * Le cambia el nombre a una cuenta.
 *
 * Una cuenta se abría y ya está: mal nombrada, se quedaba así para siempre.
 * Renombrar no tiene consecuencias en ninguna parte — quien la identifica es su
 * número, que no se toca — así que no hace falta confirmar nada.
 *
 * Se invalidan las dos rutas que la pintan: la lista y su extracto. Con una
 * sola, la otra seguiría enseñando el nombre viejo hasta que alguien recargara.
 */
export async function renameAccount(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = renameAccountSchema.safeParse({
    accountId: text(form, "accountId"),
    name: text(form, "name"),
  });

  if (!parsed.success) return { error: firstMessage(parsed.error) };

  try {
    await api<AccountView>(`/accounts/${parsed.data.accountId}`, {
      method: "PATCH",
      body: { name: parsed.data.name },
    });
  } catch (error) {
    return { error: accountProblem(error, "No se pudo cambiar el nombre.") };
  }

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${parsed.data.accountId}`);

  return { ok: true };
}

/**
 * Cierra una cuenta, o la vuelve a abrir.
 *
 * Las dos en una función porque son el mismo gesto con el signo cambiado, y
 * partirlas duplicaría la comprobación del identificador y las invalidaciones
 * para no ganar nada.
 *
 * Cerrar exige que esté a cero, y eso lo decide la API: comprobarlo aquí sería
 * comprobarlo dos veces, y la de aquí llegaría con un saldo que puede haber
 * cambiado entre que se pintó la pantalla y se pulsó el botón.
 */
export async function setAccountClosed(
  accountId: string,
  closed: boolean,
): Promise<{ ok: true } | { error: string }> {
  const parsed = accountIdSchema.safeParse(accountId);

  if (!parsed.success) return { error: firstMessage(parsed.error) };

  try {
    await api<AccountView>(`/accounts/${parsed.data}/closure`, {
      method: closed ? "POST" : "DELETE",
    });
  } catch (error) {
    return {
      error: accountProblem(
        error,
        closed ? "No se pudo cerrar la cuenta." : "No se pudo reabrir la cuenta.",
      ),
    };
  }

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${parsed.data}`);

  return { ok: true };
}

/**
 * El rechazo de la API, dicho en cristiano.
 *
 * El 409 sale tal cual porque es el único que trae un dato que hace falta: al
 * negarse a cerrar una cuenta con dinero, el mensaje dice cuánto queda. El 404
 * no se traduce por «no existe» — quien lo pide está mirando su propia cuenta,
 * y decirle eso sería llamarle mentiroso; lo que ha pasado es que ya no está
 * donde creía.
 */
function accountProblem(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) {
    return "No hemos podido conectar. Inténtalo otra vez.";
  }

  if (error.status === 409) return error.message;
  if (error.status === 404) return "Esa cuenta ya no está. Recarga la página.";

  return error.message || fallback;
}

/**
 * A quién pertenece un número de arca.
 *
 * Ésta sí es una acción de servidor: la llama el formulario de transferencia
 * mientras alguien teclea, para enseñar el nombre **antes** de confirmar. Sin
 * eso, una cifra mal puesta manda el dinero a un desconocido y no hay forma de
 * deshacerlo — sólo anularlo, y para eso hace falta que la otra parte colabore.
 *
 * Un número con mala forma se responde `null`, igual que uno que no existe. No
 * es pereza: son endpoints que cualquiera puede llamar en bucle, y contestar
 * cosas distintas a «no cuadra» y «no está» sería decirle a quien enumera
 * cuáles de sus intentos merecen otro más.
 */
export async function lookupAccount(number: string): Promise<{ name: string } | null> {
  const parsed = accountNumberSchema.safeParse(number);

  if (!parsed.success) return null;

  try {
    return await api<{ name: string }>(
      `/accounts/lookup?number=${encodeURIComponent(parsed.data)}`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    if (error instanceof ApiError && error.status === 429) {
      // La causa va enganchada: sin ella, el registro del servidor pierde el
      // rastro de que esto vino de un 429 y no de un fallo cualquiera.
      throw new Error("Demasiadas consultas seguidas. Espera un momento.", { cause: error });
    }

    throw error;
  }
}
