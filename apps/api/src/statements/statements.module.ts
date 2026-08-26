import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { StatementsService } from "./statements.service";

@Module({
  imports: [PrismaModule],
  providers: [StatementsService],
  exports: [StatementsService],
})
export class StatementsModule {}
