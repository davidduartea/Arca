import { Injectable } from "@nestjs/common";

import { NotYourAccountError } from "../auth/auth.errors";
import { isUniqueViolationOn } from "../prisma/postgres-errors";
import { generateAccountNumber, parseAccountNumber } from "../shared/account-number";
import { UnknownAccountError } from "../ledger/ledger.errors";
import { PrismaService } from "../prisma/prisma.service";
import { isUuid } from "../shared/uuid";
import type { Account, AccountDraft, AccountHolder } from "./accounts.types";

/** Cuántas veces se sortea un número antes de rendirse. */
const NUMBER_ATTEMPTS = 8;

/** Forma mínima de lo que devuelve Prisma; evita atarse a sus tipos generados. */
interface AccountRow {
  id: string;
  ownerId: string;
  name: string;
  number: string;
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

  /**
   * Abre una cuenta y le da su número.
   *
   * El número se sortea y puede chocar con uno ya emitido. La garantía de que
   * no se repite es el índice único, no la comprobación previa: entre mirar si
   * existe y escribirlo cabe otra petición. Así que se intenta, y si el índice
   * dice que no, se sortea otro.
   *
   * Con siete cifras libres, la probabilidad de choque es despreciable hasta
   * cientos de miles de cuentas. El bucle está por corrección, no por
   * frecuencia — y por eso se rinde en vez de girar para siempre.
   */
  async open(draft: AccountDraft): Promise<Account> {
    for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt++) {
      try {
        return toAccount(
          await this.prisma.account.create({
            data: {
              ownerId: draft.ownerId,
              name: draft.name,
              kind: draft.kind ?? "USER",
              number: generateAccountNumber(),
            },
          }),
        );
      } catch (error) {
        if (!isUniqueViolationOn(error, "number")) throw error;
      }
    }

    throw new Error("No se pudo emitir un número de arca libre");
  }

  async byId(accountId: string): Promise<Account | null> {
    if (!isUuid(accountId)) return null;

    const row = await this.prisma.account.findUnique({ where: { id: accountId } });
    return row ? toAccount(row) : null;
  }

  /**
   * La cuenta que corresponde a un número de arca.
   *
   * Acepta el número escrito de cualquier forma — con guiones, con espacios,
   * con o sin el prefijo — y devuelve `null` si el dígito de control no cuadra,
   * sin llegar a preguntar a la base. Un número mal copiado no es una consulta.
   */
  async byNumber(typed: string): Promise<Account | null> {
    let number: string;

    try {
      number = parseAccountNumber(typed);
    } catch {
      return null;
    }

    const row = await this.prisma.account.findUnique({ where: { number } });
    return row ? toAccount(row) : null;
  }

  /**
   * A quién pertenece un número de arca: el nombre de la persona y nada más.
   *
   * Es lo que se enseña a quien va a transferir, antes de confirmar. Antes se
   * devolvía el nombre de la **cuenta**, y eran dos errores en uno: filtraba a
   * cualquiera con doce cifras la etiqueta privada que su dueño le puso, y
   * encima no confirmaba lo que hay que confirmar — quien manda dinero quiere
   * saber a quién, no cómo llamó esa persona a su cajón.
   *
   * Va en una sola consulta con `include` en lugar de leer la cuenta y después
   * a su dueño: son dos viajes para una pantalla que se pinta mientras alguien
   * teclea.
   */
  async holderByNumber(typed: string): Promise<AccountHolder | null> {
    let number: string;

    try {
      number = parseAccountNumber(typed);
    } catch {
      return null;
    }

    const row = await this.prisma.account.findUnique({
      where: { number },
      select: { kind: true, owner: { select: { name: true } } },
    });
    if (!row) return null;

    return {
      name: row.owner.name,
      kind: row.kind === "SYSTEM" ? "SYSTEM" : "USER",
    };
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
    number: row.number,
    kind: row.kind === "SYSTEM" ? "SYSTEM" : "USER",
    createdAt: row.createdAt,
  };
}
