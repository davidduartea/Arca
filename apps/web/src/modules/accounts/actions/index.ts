"use server";

import { revalidatePath } from "next/cache";

import { ApiError, api } from "@/lib/api";
import { text } from "@/lib/form";
import { firstMessage } from "@/lib/validation";
import { accountNumberSchema } from "@/models/accounts/AccountNumber";
import type { AccountView } from "@/models/accounts/AccountView";
import { openAccountSchema } from "@/models/accounts/OpenAccountInput";
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
