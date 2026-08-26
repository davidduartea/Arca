import { Module } from "@nestjs/common";

import { loadEnvironment } from "../config/environment";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JWT_SECRET, TokenService } from "./token.service";

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    { provide: JWT_SECRET, useFactory: (): string => loadEnvironment().JWT_SECRET },
    TokenService,
    AuthService,
  ],
  // `TokenService` sale porque lo necesita el guardia global, que se registra
  // en el módulo raíz.
  exports: [TokenService],
})
export class AuthModule {}
