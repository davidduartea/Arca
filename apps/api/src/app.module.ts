import { Module } from "@nestjs/common";

import { AccountsModule } from "./accounts/accounts.module";
import { LedgerModule } from "./ledger/ledger.module";
import { StatementsModule } from "./statements/statements.module";
import { TransfersModule } from "./transfers/transfers.module";

@Module({
  imports: [AccountsModule, LedgerModule, StatementsModule, TransfersModule],
})
export class AppModule {}
