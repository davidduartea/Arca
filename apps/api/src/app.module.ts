import { Module } from "@nestjs/common";

import { AccountsModule } from "./accounts/accounts.module";
import { LedgerModule } from "./ledger/ledger.module";
import { TransfersModule } from "./transfers/transfers.module";

@Module({
  imports: [AccountsModule, LedgerModule, TransfersModule],
})
export class AppModule {}
