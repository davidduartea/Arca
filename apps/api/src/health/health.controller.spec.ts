import type { Server } from "node:http";

import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "../prisma/prisma.service";
import { createTestingApp } from "../test/database";
import { HealthController } from "./health.controller";

/**
 * Las dos comprobaciones de salud, por HTTP y con los guardias puestos.
 *
 * Lo que hay que probar aquí no es que devuelvan «ok» —eso es una línea— sino
 * que **se llegue a ellas**: el guardia de sesión es global y el limitador va
 * por delante de todo. Si cualquiera de los dos las tapara, Render leería 401 o
 * 429, daría el servicio por enfermo y lo reiniciaría en bucle. Es un fallo que
 * sólo aparece en producción y que aquí cuesta dos tests.
 */
describe("Salud", () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    app = await createTestingApp();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it("responde sin sesión", async () => {
    await request(server).get("/healthz").expect(200, { status: "ok" });
  });

  it("la consulta de disponibilidad también responde sin sesión", async () => {
    await request(server).get("/readyz").expect(200, { status: "ok" });
  });

  /**
   * Con el limitador puesto de verdad, y no el que deja pasar todo.
   *
   * El tope general son 120 peticiones por minuto y Render comprueba cada pocos
   * segundos desde una IP fija, así que sin `@SkipThrottle` el propio
   * comprobador se echaría a sí mismo. Se piden más de las que caben en el cupo:
   * si alguna contestara 429, el decorador no está haciendo su trabajo.
   */
  it("no gasta el cupo de peticiones", async () => {
    const limited = await createTestingApp({ throttle: true });

    try {
      const limitedServer = limited.getHttpServer() as Server;

      for (let attempt = 0; attempt < 130; attempt += 1) {
        await request(limitedServer).get("/healthz").expect(200);
      }
    } finally {
      await limited.close();
    }
  });

  /**
   * La razón de que sean dos endpoints y no uno.
   *
   * `/healthz` es el que mira el orquestador cada pocos segundos; si consultara
   * la base, un corte de Postgres reiniciaría el contenedor y alargaría el
   * corte en vez de arreglarlo. Se comprueba con la base caída: `/healthz`
   * sigue diciendo que el proceso vive, y `/readyz` es el que admite que no
   * puede atender.
   */
  it("con la base caída, sólo la disponibilidad falla", async () => {
    const broken = { $queryRaw: () => Promise.reject(new Error("sin conexión")) };
    const controller = new HealthController(broken as unknown as PrismaService);

    expect(controller.live()).toEqual({ status: "ok" });
    await expect(controller.ready()).rejects.toMatchObject({ status: 503 });
  });

  /**
   * El motivo del fallo no sale en la respuesta.
   *
   * El error de conexión de `pg` trae dentro el host, el puerto y a veces el
   * usuario de la base. Un endpoint público que lo repita está publicando dónde
   * vive Postgres a quien sólo preguntó si el servicio funciona.
   */
  it("no cuenta por qué falló la base", async () => {
    const broken = {
      $queryRaw: () => Promise.reject(new Error("connect ECONNREFUSED 10.1.2.3:5432")),
    };
    const controller = new HealthController(broken as unknown as PrismaService);

    await expect(controller.ready()).rejects.toMatchObject({
      response: {
        error: "DatabaseUnreachableError",
        message: "El libro no está disponible ahora mismo",
      },
    });
  });
});
