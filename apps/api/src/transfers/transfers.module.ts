import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module";
import { LedgerModule } from "../ledger/ledger.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TransfersController } from "./transfers.controller";
import { TransfersService } from "./transfers.service";

@Module({
  imports: [PrismaModule, LedgerModule, AccountsModule],
  controllers: [TransfersController],
  providers: [TransfersService],
  exports: [TransfersService],
})
export class TransfersModule {}
