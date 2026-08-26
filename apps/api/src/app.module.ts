import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { AccountsModule } from "./accounts/accounts.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { DomainExceptionFilter } from "./http/domain-exception.filter";
import { LedgerModule } from "./ledger/ledger.module";
import { StatementsModule } from "./statements/statements.module";
import { TransfersModule } from "./transfers/transfers.module";

/** Un techo general para que nadie pueda martillear la API. */
const LIMITE_GENERAL = { name: "default", ttl: 60_000, limit: 120 };

@Module({
  imports: [
    ThrottlerModule.forRoot({ throttlers: [LIMITE_GENERAL] }),
    AccountsModule,
    AuthModule,
    LedgerModule,
    StatementsModule,
    TransfersModule,
  ],
  providers: [
    // El orden es el de ejecución, y aquí importa.
    //
    // La limitación va **antes** que la autenticación: si fuera al revés,
    // probar contraseñas a ciegas costaría un hash de 64 MB por intento antes
    // de que nadie contase los intentos, y el propio remedio sería la forma de
    // tumbar el servidor.
    //
    // Va registrado dos veces a propósito: con su propia clase como token, y
    // `APP_GUARD` apuntando a esa misma instancia. Sin ese rodeo el guardia
    // existiría sólo bajo `APP_GUARD` y no habría forma de sustituirlo en los
    // tests, donde una suite que inicia sesión veinte veces se estrellaría
    // contra su propio límite antes de llegar a probar nada.
    ThrottlerGuard,
    { provide: APP_GUARD, useExisting: ThrottlerGuard },

    // Global: todo cerrado, y se abre con `@Public()`. Al revés, el día que
    // alguien añade un endpoint y se olvida del guardia, queda abierto.
    { provide: APP_GUARD, useClass: JwtAuthGuard },

    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
