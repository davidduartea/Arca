import { Module } from "@nestjs/common";

import { LedgerModule } from "../ledger/ledger.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TransfersService } from "./transfers.service";

@Module({
  imports: [PrismaModule, LedgerModule],
  providers: [TransfersService],
  exports: [TransfersService],
})
export class TransfersModule {}
