import { Module } from "@nestjs/common";

import { AccountsModule } from "./accounts/accounts.module";
import { LedgerModule } from "./ledger/ledger.module";

@Module({
  imports: [AccountsModule, LedgerModule],
})
export class AppModule {}
