import { Module } from "@nestjs/common";

import { loadEnvironment } from "../config/environment";
import { DATABASE_URL, PrismaService } from "./prisma.service";
import { READER_DATABASE_URL, ReaderService } from "./reader.service";

/**
 * Las dos conexiones a la base, que son dos autoridades distintas.
 *
 * `PrismaService` entra como `arca_ledger` y `ReaderService` como `arca_reader`.
 * Cuál usa cada servicio no es una preferencia: mover dinero necesita ver la
 * cuenta del otro y servir un extracto no. Ver `reader.service.ts`.
 *
 * Deliberadamente **no** es `@Global()`. Un módulo global ahorra imports pero
 * esconde de quién depende cada pieza; aquí quien toca la base lo declara.
 */
@Module({
  providers: [
    {
      provide: DATABASE_URL,
      useFactory: (): string => loadEnvironment().DATABASE_URL,
    },
    PrismaService,
    {
      provide: READER_DATABASE_URL,
      useFactory: (): string => loadEnvironment().READER_DATABASE_URL,
    },
    ReaderService,
  ],
  exports: [PrismaService, ReaderService],
})
export class PrismaModule {}
