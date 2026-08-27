import { Module } from "@nestjs/common";

import { LedgerModule } from "../ledger/ledger.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AccountLookupController } from "./account-lookup.controller";
import { AccountsController } from "./accounts.controller";
import { AccountsService } from "./accounts.service";

@Module({
  imports: [PrismaModule, LedgerModule],

  // El orden importa y no es cosmético.
  //
  // `AccountsController` tiene una ruta `:accountId`, que casa con cualquier
  // cosa — incluida la palabra «lookup». Nest resuelve por orden de registro,
  // así que si fuera primero, `/accounts/lookup` acabaría buscando una cuenta
  // llamada «lookup», fallando el uuid y devolviendo 404.
  //
  // La ruta concreta va antes que la comodín.
  controllers: [AccountLookupController, AccountsController],

  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
