import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/** Token de la cadena de conexión, para poder apuntar a otra base en los tests. */
export const DATABASE_URL = Symbol("DATABASE_URL");

/**
 * El cliente de Prisma con el ciclo de vida de Nest.
 *
 * Prisma 7 ya no abre la conexión por su cuenta: hay que darle un **adaptador
 * de driver**. Antes bastaba con la `url` del esquema; ahora el esquema sólo
 * dice con qué motor habla y quien conecta es `pg`.
 * 📖 https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(DATABASE_URL) connectionString: string) {
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Conectado a Postgres");
  }

  async onModuleDestroy(): Promise<void> {
    // Cierra el pool de `pg`. Sin esto el proceso se queda vivo al recibir
    // SIGTERM y el orquestador acaba matándolo a la fuerza — y en medio puede
    // haber una transacción a mitad.
    await this.$disconnect();
  }
}
