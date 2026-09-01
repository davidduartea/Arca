import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/** Token de la cadena de conexión del lector, para poder apuntar a otra base en los tests. */
export const READER_DATABASE_URL = Symbol("READER_DATABASE_URL");

/**
 * Lo que se le puede pedir a la base dentro de `asUser`.
 *
 * Es el cliente de Prisma **sin** lo que abre o cierra conexiones ni transacciones:
 * dentro ya hay una abierta, y anidar otra sobre el mismo cliente no funciona.
 */
export type ReadOnlyClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$transaction" | "$on" | "$extends"
>;

/**
 * La conexión que sólo lee, y sólo lo tuyo.
 *
 * Es un segundo cliente de Prisma contra la misma base, con **otro rol**:
 * `arca_reader`, que tiene `SELECT` y nada más, y que además está sujeto a las
 * políticas por fila de la migración `dos_roles_y_rls`.
 *
 * ## Por qué otra conexión y no una comprobación más
 *
 * Porque la comprobación ya existe y ya se hace — `requireOwnedBy` — y esto está
 * para el día en que a alguien se le olvide. Una consulta que se deje el filtro
 * por dueño no devuelve datos de más: devuelve **cero filas**, porque el rol con
 * el que viaja no tiene forma de ver lo ajeno. Ese es el punto entero: no es una
 * segunda comprobación en el mismo sitio, es que el permiso no está.
 *
 * El precio son un pool de conexiones más y una transacción por lectura. En el
 * plan gratuito de Supabase caben de sobra: el pooler admite del orden de
 * sesenta conexiones y esto suma unas pocas.
 *
 * ## Lo que NO puede pasar por aquí
 *
 * **El camino del dinero.** Una transferencia bloquea la cuenta del destinatario
 * y le escribe un asiento, y para este rol esa cuenta no existe: el bloqueo se
 * quedaría en la mitad de las filas sin dar error, y una comprobación de fondos
 * sobre la cuenta que cobró leería cero. Callando las dos veces, que es lo peor
 * que puede hacer. Por eso mover dinero va por `PrismaService` y nunca por aquí.
 */
@Injectable()
export class ReaderService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReaderService.name);

  constructor(@Inject(READER_DATABASE_URL) connectionString: string) {
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Conectado a Postgres como lector");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Lee la base en nombre de alguien.
   *
   * Las políticas preguntan por `arca.user_id`, y esto es lo único que lo pone.
   * Va **dentro de una transacción** porque no queda más remedio: con un pool,
   * dos consultas seguidas pueden salir por conexiones distintas, y un ajuste de
   * sesión puesto en una no viaja a la otra — peor aún, se quedaría pegado a esa
   * conexión y la siguiente persona que la reutilizara leería con la identidad
   * de la anterior. El tercer argumento de `set_config` es precisamente eso:
   * `true` significa «hasta el final de esta transacción y ni un milisegundo
   * más».
   *
   * Cuesta un `BEGIN` y un `COMMIT` por lectura. Es el precio de que la frontera
   * la sujete Postgres y no una convención.
   *
   * Si nadie llamara a esto, las políticas no verían ninguna identidad y la
   * respuesta sería vacía. Cerrado por defecto otra vez: olvidarse no abre nada.
   */
  async asUser<T>(userId: string, work: (db: ReadOnlyClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('arca.user_id', ${userId}, true)`;

      return work(tx);
    });
  }
}
