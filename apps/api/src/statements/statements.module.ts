import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module";
import { PrismaModule } from "../prisma/prisma.module";
import { StatementsController } from "./statements.controller";
import { StatementsService } from "./statements.service";

@Module({
  imports: [PrismaModule, AccountsModule],
  controllers: [StatementsController],
  providers: [StatementsService],
  exports: [StatementsService],
})
export class StatementsModule {}
