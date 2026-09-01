"use server";

import { revalidatePath } from "next/cache";

import { ApiError, api } from "@/lib/api";
import { text } from "@/lib/form";
import { InvalidAmountError, dollarsToCents, formatUsd } from "@/lib/money";
import { firstMessage } from "@/lib/validation";
import { accountIdSchema } from "@/models/accounts/AccountId";
import { depositSchema } from "@/models/transfers/DepositInput";
import type { MoveState } from "@/models/transfers/MoveState";
import type { TransactionView } from "@/models/transfers/TransactionView";
import { transactionIdSchema } from "@/models/transfers/TransactionId";
import { transferSchema } from "@/models/transfers/TransferInput";

/**
 * Mover dinero de una cuenta propia a cualquier arca.
 *
 * Lo primero que pasa es la comprobación de forma, y no es un adorno: esta
 * función es un endpoint público, así que sus argumentos los elige quien la
 * llama. El identificador de origen viaja además dentro de un `revalidatePath`,
 * que es otra cadena que no debería aceptar lo que sea.
 */
export async function transfer(_previous: MoveState, form: FormData): Promise<MoveState> {
  const parsed = transferSchema.safeParse({
    idempotencyKey: text(form, "idempotencyKey"),
    fromAccountId: text(form, "fromAccountId"),
    toAccountNumber: text(form, "toAccountNumber"),
    amount: text(form, "amount"),
    description: text(form, "description"),
  });

  if (!parsed.success) return { error: firstMessage(parsed.error) };

  const { idempotencyKey, fromAccountId, toAccountNumber, description } = parsed.data;

  // El importe tiene su propio guardián: es quien sabe leer «1250,50» y quien
  // da el mensaje bueno cuando no se entiende.
  let amount: string;
  try {
    amount = dollarsToCents(parsed.data.amount);
  } catch (error) {
    return { error: amountProblem(error) };
  }

  try {
    await api<TransactionView>("/transfers", {
      method: "POST",
      body: {
        fromAccountId,
        toAccountNumber,
        amount,
        ...(description ? { description } : {}),
        idempotencyKey,
      },
    });
  } catch (error) {
    return toMoveState(error);
  }

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${fromAccountId}`);

  return { done: { amount, description: description || "Transferencia" } };
}

/** Dinero que entra desde fuera del banco, siempre a una cuenta propia. */
export async function deposit(_previous: MoveState, form: FormData): Promise<MoveState> {
  const parsed = depositSchema.safeParse({
    idempotencyKey: text(form, "idempotencyKey"),
    toAccountId: text(form, "toAccountId"),
    amount: text(form, "amount"),
    description: text(form, "description"),
  });

  if (!parsed.success) return { error: firstMessage(parsed.error) };

  const { idempotencyKey, toAccountId, description } = parsed.data;

  let amount: string;
  try {
    amount = dollarsToCents(parsed.data.amount);
  } catch (error) {
    return { error: amountProblem(error) };
  }

  try {
    await api<TransactionView>("/deposits", {
      method: "POST",
      body: {
        toAccountId,
        amount,
        ...(description ? { description } : {}),
        idempotencyKey,
      },
    });
  } catch (error) {
    return toMoveState(error);
  }

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${toAccountId}`);

  return { done: { amount, description: description || "Ingreso" } };
}

/**
 * Devolver un movimiento que entró en una cuenta tuya.
 *
 * Sólo puede pedirlo quien lo recibió, y eso lo decide la API: aquí no hay
 * comprobación de propiedad porque una hecha en el navegador no protege de
 * nada. Lo que sí se comprueba es la forma del identificador, que viaja dentro
 * de la ruta.
 *
 * La cuenta llega aparte y sólo para refrescar su extracto. No se usa para
 * autorizar nada — si no fuera tuya, la API ya habría contestado que no.
 */
export async function reverseTransaction(
  transactionId: string,
  accountId: string,
): Promise<{ ok: true } | { error: string }> {
  const parsed = transactionIdSchema.safeParse(transactionId);
  if (!parsed.success) return { error: firstMessage(parsed.error) };

  const account = accountIdSchema.safeParse(accountId);
  if (!account.success) return { error: firstMessage(account.error) };

  try {
    await api<TransactionView>(`/transactions/${parsed.data}/reversal`, { method: "POST" });
  } catch (error) {
    return toReversalProblem(error);
  }

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${account.data}`);

  return { ok: true };
}

/**
 * Los tres noes de anular, dichos en cristiano.
 *
 * El 404 no se traduce por «no existe»: para quien mira su propio extracto, un
 * movimiento que la API dice no encontrar es uno que ya no se puede devolver
 * —lo anuló otro, o nunca fue suyo—. Decirle «no existe» sobre una línea que
 * está viendo en pantalla sería llamarle mentiroso.
 */
function toReversalProblem(error: unknown): { error: string } {
  if (!(error instanceof ApiError)) {
    return { error: "No hemos podido conectar. Inténtalo otra vez." };
  }

  if (error.code === "AlreadyReversedError") {
    return { error: "Este movimiento ya estaba anulado. Recarga para verlo." };
  }

  if (error.code === "InsufficientFundsError") {
    return { error: "Ya no queda bastante en la cuenta para devolverlo." };
  }

  if (error.status === 404) {
    return { error: "Este movimiento ya no se puede devolver. Recarga el extracto." };
  }

  return { error: error.message };
}

function amountProblem(error: unknown): string {
  if (error instanceof InvalidAmountError) {
    return "El importe tiene que ser una cantidad positiva, como 1250.50.";
  }

  return "No se entendió el importe.";
}

/**
 * Traduce el rechazo de la API.
 *
 * El caso que merece trato aparte es el 409 por fondos: se saca del mensaje
 * cuánto hay y cuánto se pedía para poder enseñar también lo que falta. Es un
 * rechazo esperable, no una avería, y la pantalla lo trata como tal.
 */
function toMoveState(error: unknown): MoveState {
  if (!(error instanceof ApiError)) {
    return { error: "No se pudo conectar con el libro. No se ha movido nada." };
  }

  if (error.code === "InsufficientFundsError") {
    const shortfall = readShortfall(error.message);

    return shortfall
      ? { error: "No hay bastante en la cuenta.", shortfall }
      : { error: error.message };
  }

  if (error.status === 404) {
    return {
      error: "No encontramos ninguna arca con ese número. Comprueba con quien te lo dio.",
    };
  }

  return { error: error.message };
}

/** El mensaje de la API trae los dos importes ya formateados. */
const FUNDS = /tiene (−?\$[\d,.]+) y se le piden (\$[\d,.]+)/u;

function readShortfall(message: string): MoveState["shortfall"] {
  const match = FUNDS.exec(message);
  if (!match) return undefined;

  const [, available, requested] = match;
  if (!available || !requested) return undefined;

  return {
    available,
    requested,
    missing: formatUsd((toCents(requested) - toCents(available)).toString()),
  };
}

function toCents(formatted: string): bigint {
  const digits = formatted.replace(/[^\d]/g, "");
  const value = BigInt(digits || "0");

  return formatted.startsWith("−") ? -value : value;
}
