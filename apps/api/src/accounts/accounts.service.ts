import { Injectable } from "@nestjs/common";

import { NotYourAccountError } from "../auth/auth.errors";
import { UnknownAccountError } from "../ledger/ledger.errors";
import { PrismaService } from "../prisma/prisma.service";
import { isUuid } from "../shared/uuid";
import type { Account, AccountDraft } from "./accounts.types";

/** Forma mínima de lo que devuelve Prisma; evita atarse a sus tipos generados. */
interface AccountRow {
  id: string;
  ownerId: string;
  name: string;
  kind: string;
  createdAt: Date;
}

/**
 * Las cuentas del libro.
 *
 * Sin saldo: el saldo lo deriva el motor de asientos sumando los movimientos.
 * Aquí sólo vive quién es dueño de qué y cómo se llama.
 */
@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async open(draft: AccountDraft): Promise<Account> {
    return toAccount(
      await this.prisma.account.create({
        data: {
          ownerId: draft.ownerId,
          name: draft.name,
          kind: draft.kind ?? "USER",
        },
      }),
    );
  }

  async byId(accountId: string): Promise<Account | null> {
    if (!isUuid(accountId)) return null;

    const row = await this.prisma.account.findUnique({ where: { id: accountId } });
    return row ? toAccount(row) : null;
  }

  /**
   * La cuenta, si es de quien pregunta.
   *
   * Distingue «no existe» de «no es tuya» porque para registrar y depurar son
   * cosas distintas. La capa HTTP los colapsa a propósito en un mismo 404:
   * contestar 403 confirmaría que esa cuenta existe, y quien va probando
   * identificadores no tiene por qué averiguarlo.
   */
  async requireOwnedBy(accountId: string, ownerId: string): Promise<Account> {
    const account = await this.byId(accountId);
    if (!account) throw new UnknownAccountError(accountId);
    if (account.ownerId !== ownerId) throw new NotYourAccountError(accountId);

    return account;
  }

  async byOwner(ownerId: string): Promise<Account[]> {
    if (!isUuid(ownerId)) return [];

    const rows = await this.prisma.account.findMany({
      where: { ownerId },
      orderBy: { createdAt: "asc" },
    });

    return rows.map(toAccount);
  }
}

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    kind: row.kind === "SYSTEM" ? "SYSTEM" : "USER",
    createdAt: row.createdAt,
  };
}
