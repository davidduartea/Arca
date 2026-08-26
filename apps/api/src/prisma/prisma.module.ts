import { Module } from "@nestjs/common";

import { loadEnvironment } from "../config/environment";
import { DATABASE_URL, PrismaService } from "./prisma.service";

/**
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
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
