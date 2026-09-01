import { Injectable } from "@nestjs/common";

import { NotYourAccountError } from "../auth/auth.errors";
import { AccountClosedError, AccountNotEmptyError } from "./accounts.errors";
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
  closedAt: Date | null;
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
      select: { kind: true, closedAt: true, owner: { select: { name: true } } },
    });
    if (!row) return null;

    return {
      name: row.owner.name,
      kind: row.kind === "SYSTEM" ? "SYSTEM" : "USER",
      closed: row.closedAt !== null,
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

  /**
   * Le cambia el nombre. Nada más.
   *
   * El nombre de una cuenta es una etiqueta para su dueño y no la identifica:
   * quien la identifica es el número, que no se toca. Por eso renombrar no
   * tiene consecuencias en ninguna parte — el extracto, los asientos y lo que
   * ve quien te transfiere siguen igual.
   */
  async rename(accountId: string, ownerId: string, name: string): Promise<Account> {
    await this.requireOwnedBy(accountId, ownerId);

    return toAccount(
      await this.prisma.account.update({ where: { id: accountId }, data: { name } }),
    );
  }

  /**
   * La saca de circulación, sin borrar nada.
   *
   * Borrar no es una opción y no por pereza: los asientos apuntan a la cuenta y
   * son inmutables, así que borrarla dejaría un extracto que habla de algo que
   * no existe. Cerrar es marcarla — deja de poder mandar y de poder recibir, y
   * su extracto se sigue leyendo entero.
   *
   * **Sólo se cierra a cero.** Con dinero dentro, cerrar sería esconderlo: la
   * cuenta desaparece de las que se pueden usar y el saldo se queda ahí, sin
   * que nadie haya dicho a dónde iba. Que lo saque su dueño primero.
   *
   * Cerrar dos veces no es un error: quien pide lo que ya está hecho quería
   * exactamente el estado en el que está. Se devuelve la cuenta tal cual, sin
   * mover la fecha — moverla convertiría un doble clic en una fecha de cierre
   * falsa.
   *
   * El saldo llega como función y no como número para que no se calcule antes
   * de saber que la cuenta es suya: sumar los asientos de la cuenta de otro
   * para tirar el resultado es trabajo regalado a quien prueba identificadores.
   * Y sobra del todo si ya estaba cerrada.
   */
  async close(
    accountId: string,
    ownerId: string,
    balanceOf: () => Promise<bigint>,
  ): Promise<Account> {
    const account = await this.requireOwnedBy(accountId, ownerId);
    if (account.closedAt) return account;

    const balance = await balanceOf();
    if (balance !== 0n) throw new AccountNotEmptyError(accountId, balance);

    return toAccount(
      await this.prisma.account.update({
        where: { id: accountId },
        data: { closedAt: new Date() },
      }),
    );
  }

  /**
   * La vuelve a poner en circulación.
   *
   * Cerrar tiene que poder deshacerse. Aquí no hay administrador a quien
   * escribirle, así que un cierre irreversible convertiría un clic de más en
   * una cuenta perdida para siempre — con su número, que es lo que la gente ya
   * dio a otros.
   */
  async reopen(accountId: string, ownerId: string): Promise<Account> {
    const account = await this.requireOwnedBy(accountId, ownerId);
    if (!account.closedAt) return account;

    return toAccount(
      await this.prisma.account.update({
        where: { id: accountId },
        data: { closedAt: null },
      }),
    );
  }

  /**
   * La cuenta, si es de quien pregunta **y sigue abierta**.
   *
   * Lo que usa quien va a mover dinero. Separado de `requireOwnedBy` a
   * propósito: leer el extracto de una cuenta cerrada tiene que seguir siendo
   * posible — es el histórico de lo que pasó — y sólo se cierra la puerta a lo
   * que la usaría como cuenta viva.
   */
  async requireUsable(accountId: string, ownerId: string): Promise<Account> {
    const account = await this.requireOwnedBy(accountId, ownerId);
    if (account.closedAt) throw new AccountClosedError(accountId);

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
    closedAt: row.closedAt,
    createdAt: row.createdAt,
  };
}
