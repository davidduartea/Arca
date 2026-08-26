import { Module } from "@nestjs/common";

import { LedgerModule } from "../ledger/ledger.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AccountsController } from "./accounts.controller";
import { AccountsService } from "./accounts.service";

@Module({
  imports: [PrismaModule, LedgerModule],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
