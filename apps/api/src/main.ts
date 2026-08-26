import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { loadEnvironment } from "./config/environment";

async function bootstrap(): Promise<void> {
  // Antes de montar nada: si falta configuración, mejor no levantar.
  const env = loadEnvironment();

  const app = await NestFactory.create(AppModule);

  // Sin esto, `onModuleDestroy` nunca corre y el pool de Postgres se queda
  // abierto al recibir SIGTERM: el orquestador acaba matando el proceso a la
  // fuerza, y en medio puede haber una transacción a mitad.
  app.enableShutdownHooks();

  await app.listen(env.PORT, "0.0.0.0");

  new Logger("Arca").log(`Escuchando en el puerto ${env.PORT}`);
}

void bootstrap();
