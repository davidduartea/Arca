import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module";
import { loadDotEnvFile } from "./config/dotenv";
import { loadEnvironment } from "./config/environment";

async function bootstrap(): Promise<void> {
  // En desarrollo la configuración vive en un archivo; en producción, en el
  // entorno. Nest no carga el archivo por su cuenta.
  loadDotEnvFile();

  // Y antes de montar nada: si falta configuración, mejor no levantar.
  const env = loadEnvironment();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // De cuántos proxies fiarse al deducir la IP de quien llama. De ello depende
  // que la limitación de intentos cuente a la persona correcta.
  app.set("trust proxy", env.TRUST_PROXY_HOPS);

  // Sin esto, `onModuleDestroy` nunca corre y el pool de Postgres se queda
  // abierto al recibir SIGTERM: el orquestador acaba matando el proceso a la
  // fuerza, y en medio puede haber una transacción a mitad.
  app.enableShutdownHooks();

  // Explícito: sin dirección, Node puede escuchar sólo en loopback dentro de un
  // contenedor. El proceso arranca, los logs parecen sanos y no llega nada.
  await app.listen(env.PORT, "0.0.0.0");

  new Logger("Arca").log(`Escuchando en el puerto ${env.PORT}`);
}

void bootstrap();
