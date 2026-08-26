import type { Account } from "../accounts/accounts.types";
import type { PostedTransaction } from "../ledger/ledger.types";
import type { StatementLine, StatementPage } from "../statements/statements.types";
import { toWire } from "../shared/money";

/**
 * El formato con el que sale todo por la API.
 *
 * Vive en un solo archivo a propósito. La decisión que hay detrás — **los
 * importes viajan como texto** — sólo se sostiene si no hay ningún sitio donde
 * se haya colado un `bigint` sin convertir, y eso es fácil de garantizar
 * mirando un archivo e imposible repartido por tres controladores.
 *
 * Por qué texto: un número en JSON es un `double` de IEEE 754, así que por
 * encima de 2^53 centavos `JSON.parse` redondea en silencio. El mismo problema
 * de precisión que el proyecto evita guardando enteros volvería a entrar por la
 * puerta de la API. Y `JSON.stringify` ni siquiera sabe serializar un `bigint`:
 * lanza. Hay quien lo resuelve parcheando `BigInt.prototype.toJSON`, y eso
 * convierte la decisión en un accidente global que nadie ve al leer el código.
 *
 * Las fechas salen en ISO 8601 por lo mismo: un formato explícito, sin husos ni
 * ambigüedad.
 */

export interface AccountView {
  id: string;
  name: string;
  kind: "USER" | "SYSTEM";
  /** Centavos, como texto. */
  balance: string;
  createdAt: string;
}

export function accountView(account: Account, balance: bigint): AccountView {
  return {
    id: account.id,
    name: account.name,
    kind: account.kind,
    balance: toWire(balance),
    createdAt: account.createdAt.toISOString(),
  };
}

export interface EntryView {
  id: string;
  accountId: string;
  /** Centavos, como texto. Negativo sale, positivo entra. */
  amount: string;
}

export interface TransactionView {
  id: string;
  description: string;
  reversesId: string | null;
  createdAt: string;
  entries: EntryView[];
}

export function transactionView(transaction: PostedTransaction): TransactionView {
  return {
    id: transaction.id,
    description: transaction.description,
    reversesId: transaction.reversesId,
    createdAt: transaction.createdAt.toISOString(),
    entries: transaction.entries.map((entry) => ({
      id: entry.id,
      accountId: entry.accountId,
      amount: toWire(entry.amount),
    })),
  };
}

export interface StatementLineView {
  entryId: string;
  transactionId: string;
  description: string;
  amount: string;
  balance: string;
  isReversal: boolean;
  createdAt: string;
}

export interface StatementPageView {
  lines: StatementLineView[];
  nextCursor: string | null;
}

export function statementPageView(page: StatementPage): StatementPageView {
  return {
    lines: page.lines.map(statementLineView),
    nextCursor: page.nextCursor,
  };
}

function statementLineView(line: StatementLine): StatementLineView {
  return {
    entryId: line.entryId,
    transactionId: line.transactionId,
    description: line.description,
    amount: toWire(line.amount),
    balance: toWire(line.balance),
    isReversal: line.isReversal,
    createdAt: line.createdAt.toISOString(),
  };
}
