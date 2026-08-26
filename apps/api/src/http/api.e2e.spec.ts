import { randomUUID } from "node:crypto";
import type { Server } from "node:http";

import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaService } from "../prisma/prisma.service";
import { WORLD_ACCOUNT_ID } from "../shared/system-account";
import { createTestingApp, truncateAll } from "../test/database";

const PASSWORD = "una-contraseña-larga";

/**
 * La API por HTTP de verdad, con guardias y filtro de errores puestos.
 *
 * Llamar a los servicios a pelo no prueba nada de lo que esta capa aporta: que
 * el guardia sea global, que un error del dominio se convierta en el código de
 * estado correcto, o que un importe salga como texto y no como número.
 */
describe("API HTTP", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: Server;

  beforeAll(async () => {
    app = await createTestingApp();
    prisma = app.get(PrismaService);
    servidor = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  const registrar = async (email = `${randomUUID()}@arca.test`) => {
    const respuesta = await request(servidor)
      .post("/auth/register")
      .send({ email, password: PASSWORD })
      .expect(201);

    return {
      email,
      token: respuesta.body.token as string,
      userId: respuesta.body.user.id as string,
    };
  };

  const abrirCuenta = async (token: string, name = "Cuenta corriente") => {
    const respuesta = await request(servidor)
      .post("/accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name })
      .expect(201);

    return respuesta.body.id as string;
  };

  const ingresar = (token: string, accountId: string, centavos: string) =>
    request(servidor)
      .post("/deposits")
      .set("Authorization", `Bearer ${token}`)
      .send({ toAccountId: accountId, amount: centavos });

  describe("registro e inicio de sesión", () => {
    it("registrarse devuelve el usuario y un token", async () => {
      const respuesta = await request(servidor)
        .post("/auth/register")
        .send({ email: "ana@arca.test", password: PASSWORD })
        .expect(201);

      expect(respuesta.body.user.email).toBe("ana@arca.test");
      expect(respuesta.body.token).toEqual(expect.any(String));
      expect(respuesta.body.expiresInSeconds).toBe(3600);
    });

    it("nunca devuelve el hash de la contraseña", async () => {
      const respuesta = await request(servidor)
        .post("/auth/register")
        .send({ email: "ana@arca.test", password: PASSWORD })
        .expect(201);

      expect(JSON.stringify(respuesta.body)).not.toContain("scrypt");
      expect(respuesta.body.user.passwordHash).toBeUndefined();
    });

    it("normaliza el correo a minúsculas", async () => {
      await request(servidor)
        .post("/auth/register")
        .send({ email: "  Ana@Arca.Test  ", password: PASSWORD })
        .expect(201);

      // Y por tanto se puede entrar escribiéndolo de cualquier forma.
      await request(servidor)
        .post("/auth/login")
        .send({ email: "ANA@arca.test", password: PASSWORD })
        .expect(200);
    });

    it("no deja registrar dos veces el mismo correo", async () => {
      await registrar("ana@arca.test");

      await request(servidor)
        .post("/auth/register")
        .send({ email: "ana@arca.test", password: PASSWORD })
        .expect(409);
    });

    it("exige una contraseña larga y un correo con forma de correo", async () => {
      await request(servidor)
        .post("/auth/register")
        .send({ email: "ana@arca.test", password: "corta" })
        .expect(400);

      await request(servidor)
        .post("/auth/register")
        .send({ email: "no-es-un-correo", password: PASSWORD })
        .expect(400);
    });

    it("da la misma respuesta si falla el correo o la contraseña", async () => {
      await registrar("ana@arca.test");

      const malaPassword = await request(servidor)
        .post("/auth/login")
        .send({ email: "ana@arca.test", password: "otra-contraseña-larga" })
        .expect(401);

      const noExiste = await request(servidor)
        .post("/auth/login")
        .send({ email: "nadie@arca.test", password: PASSWORD })
        .expect(401);

      // Distinguirlos diría a quien prueba qué correos están registrados.
      expect(malaPassword.body.message).toBe(noExiste.body.message);
    });
  });

  describe("el guardia es global", () => {
    it("sin token no se pasa", async () => {
      await request(servidor).get("/accounts").expect(401);
      await request(servidor).get("/auth/me").expect(401);
      await request(servidor).post("/transfers").send({}).expect(401);
    });

    it("con un token inventado tampoco", async () => {
      await request(servidor)
        .get("/accounts")
        .set("Authorization", "Bearer esto.no.es")
        .expect(401);
    });

    it("y el esquema tiene que ser Bearer", async () => {
      const { token } = await registrar();

      await request(servidor).get("/accounts").set("Authorization", token).expect(401);
      await request(servidor).get("/accounts").set("Authorization", "Basic abc").expect(401);
    });

    it("con token válido sí", async () => {
      const { token, email } = await registrar();

      const respuesta = await request(servidor)
        .get("/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(respuesta.body.user.email).toBe(email);
    });
  });

  describe("cuentas", () => {
    it("una cuenta recién abierta empieza a cero", async () => {
      const { token } = await registrar();

      const respuesta = await request(servidor)
        .post("/accounts")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Ahorro" })
        .expect(201);

      expect(respuesta.body.name).toBe("Ahorro");
      expect(respuesta.body.kind).toBe("USER");
      expect(respuesta.body.balance).toBe("0");
    });

    it("no deja abrir una cuenta de sistema", async () => {
      const { token } = await registrar();

      const respuesta = await request(servidor)
        .post("/accounts")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Trampa", kind: "SYSTEM" })
        .expect(201);

      // El campo se ignora. Si se aceptara, cualquiera abriría una cuenta que
      // se salta la comprobación de fondos y se transferiría dinero de la nada.
      expect(respuesta.body.kind).toBe("USER");
    });

    it("cada cual sólo ve las suyas", async () => {
      const ana = await registrar();
      const luis = await registrar();
      await abrirCuenta(ana.token, "De Ana");
      await abrirCuenta(luis.token, "De Luis");

      const respuesta = await request(servidor)
        .get("/accounts")
        .set("Authorization", `Bearer ${ana.token}`)
        .expect(200);

      expect(respuesta.body.accounts).toHaveLength(1);
      expect(respuesta.body.accounts[0].name).toBe("De Ana");
    });

    it("la cuenta de otro responde 404, no 403", async () => {
      const ana = await registrar();
      const luis = await registrar();
      const suya = await abrirCuenta(luis.token);

      // Un 403 confirmaría que esa cuenta existe. Para quien no es el dueño,
      // sencillamente no está.
      const respuesta = await request(servidor)
        .get(`/accounts/${suya}`)
        .set("Authorization", `Bearer ${ana.token}`)
        .expect(404);

      expect(respuesta.body.message).not.toContain("tuya");
    });

    it("una cuenta que no existe responde igual que la de otro", async () => {
      const { token } = await registrar();

      await request(servidor)
        .get(`/accounts/${randomUUID()}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });
  });

  describe("el dinero cruza el cable como texto", () => {
    it("los importes salen en centavos, como cadena", async () => {
      const { token } = await registrar();
      const cuenta = await abrirCuenta(token);
      await ingresar(token, cuenta, "10000").expect(201);

      const respuesta = await request(servidor)
        .get(`/accounts/${cuenta}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(respuesta.body.balance).toBe("10000");
      expect(typeof respuesta.body.balance).toBe("string");
    });

    it("un importe que llega como número JSON se rechaza", async () => {
      const { token } = await registrar();
      const cuenta = await abrirCuenta(token);

      // Aceptarlo metería el importe por un `double` de IEEE 754, y por encima
      // de 2^53 centavos el redondeo pasaría sin que nadie se entere.
      await request(servidor)
        .post("/deposits")
        .set("Authorization", `Bearer ${token}`)
        .send({ toAccountId: cuenta, amount: 10000 })
        .expect(400);
    });

    it("sobrevive a importes que no caben en un entero de JavaScript", async () => {
      const { token } = await registrar();
      const cuenta = await abrirCuenta(token);
      const enorme = "9007199254740993";

      await ingresar(token, cuenta, enorme).expect(201);

      const respuesta = await request(servidor)
        .get(`/accounts/${cuenta}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      // Con un número JSON, esto habría vuelto como 9007199254740992.
      expect(respuesta.body.balance).toBe(enorme);
    });

    it("rechaza importes con signo o con decimales", async () => {
      const { token } = await registrar();
      const cuenta = await abrirCuenta(token);

      await ingresar(token, cuenta, "-100").expect(400);
      await ingresar(token, cuenta, "10.50").expect(400);
      await ingresar(token, cuenta, "0").expect(400);
    });
  });

  describe("transferencias", () => {
    it("mueve dinero entre cuentas", async () => {
      const ana = await registrar();
      const luis = await registrar();
      const suyaAna = await abrirCuenta(ana.token);
      const suyaLuis = await abrirCuenta(luis.token);
      await ingresar(ana.token, suyaAna, "10000").expect(201);

      const respuesta = await request(servidor)
        .post("/transfers")
        .set("Authorization", `Bearer ${ana.token}`)
        .send({ fromAccountId: suyaAna, toAccountId: suyaLuis, amount: "2500" })
        .expect(201);

      const asientos = respuesta.body.entries as { amount: string }[];

      expect(asientos).toHaveLength(2);
      expect(asientos.map((asiento) => asiento.amount)).toEqual(["-2500", "2500"]);
    });

    it("no se puede sacar dinero de la cuenta de otro", async () => {
      const ana = await registrar();
      const luis = await registrar();
      const suyaAna = await abrirCuenta(ana.token);
      const suyaLuis = await abrirCuenta(luis.token);
      await ingresar(luis.token, suyaLuis, "10000").expect(201);

      // El control de seguridad del módulo: se puede ingresar a cualquiera,
      // pero sólo sacar de lo propio.
      await request(servidor)
        .post("/transfers")
        .set("Authorization", `Bearer ${ana.token}`)
        .send({ fromAccountId: suyaLuis, toAccountId: suyaAna, amount: "2500" })
        .expect(404);
    });

    it("tampoco se puede ingresar en la cuenta de otro desde el mundo exterior", async () => {
      const ana = await registrar();
      const luis = await registrar();
      const suyaLuis = await abrirCuenta(luis.token);

      await ingresar(ana.token, suyaLuis, "10000").expect(404);
    });

    it("nadie puede usar la cuenta del mundo exterior como origen", async () => {
      const ana = await registrar();
      const suya = await abrirCuenta(ana.token);

      await request(servidor)
        .post("/transfers")
        .set("Authorization", `Bearer ${ana.token}`)
        .send({ fromAccountId: WORLD_ACCOUNT_ID, toAccountId: suya, amount: "100000" })
        .expect(404);
    });

    it("sin fondos responde 409", async () => {
      const ana = await registrar();
      const luis = await registrar();
      const suyaAna = await abrirCuenta(ana.token);
      const suyaLuis = await abrirCuenta(luis.token);
      await ingresar(ana.token, suyaAna, "1000").expect(201);

      const respuesta = await request(servidor)
        .post("/transfers")
        .set("Authorization", `Bearer ${ana.token}`)
        .send({ fromAccountId: suyaAna, toAccountId: suyaLuis, amount: "5000" })
        .expect(409);

      expect(respuesta.body.error).toBe("InsufficientFundsError");
    });

    it("reintentar con la misma clave no cobra dos veces", async () => {
      const ana = await registrar();
      const luis = await registrar();
      const suyaAna = await abrirCuenta(ana.token);
      const suyaLuis = await abrirCuenta(luis.token);
      await ingresar(ana.token, suyaAna, "10000").expect(201);

      const orden = {
        fromAccountId: suyaAna,
        toAccountId: suyaLuis,
        amount: "2500",
        idempotencyKey: randomUUID(),
      };

      const primera = await request(servidor)
        .post("/transfers")
        .set("Authorization", `Bearer ${ana.token}`)
        .send(orden)
        .expect(201);

      const reintento = await request(servidor)
        .post("/transfers")
        .set("Authorization", `Bearer ${ana.token}`)
        .send(orden)
        .expect(201);

      expect(reintento.body.id).toBe(primera.body.id);

      const saldo = await request(servidor)
        .get(`/accounts/${suyaAna}`)
        .set("Authorization", `Bearer ${ana.token}`)
        .expect(200);

      expect(saldo.body.balance).toBe("7500");
    });
  });

  describe("extracto", () => {
    it("devuelve las líneas con su saldo corriente", async () => {
      const { token } = await registrar();
      const cuenta = await abrirCuenta(token);
      await ingresar(token, cuenta, "5000").expect(201);
      await ingresar(token, cuenta, "3000").expect(201);

      const respuesta = await request(servidor)
        .get(`/accounts/${cuenta}/statement`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(respuesta.body.lines).toHaveLength(2);
      expect(respuesta.body.lines[0].balance).toBe("8000");
      expect(respuesta.body.nextCursor).toBeNull();
    });

    it("pagina con el cursor que ella misma devuelve", async () => {
      const { token } = await registrar();
      const cuenta = await abrirCuenta(token);
      await ingresar(token, cuenta, "5000").expect(201);
      await ingresar(token, cuenta, "3000").expect(201);

      const primera = await request(servidor)
        .get(`/accounts/${cuenta}/statement?limit=1`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(primera.body.nextCursor).toEqual(expect.any(String));

      const segunda = await request(servidor)
        .get(`/accounts/${cuenta}/statement?limit=1&cursor=${primera.body.nextCursor}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(segunda.body.lines[0].entryId).not.toBe(primera.body.lines[0].entryId);
    });

    it("un cursor inventado es un 400", async () => {
      const { token } = await registrar();
      const cuenta = await abrirCuenta(token);

      await request(servidor)
        .get(`/accounts/${cuenta}/statement?cursor=basura`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
    });

    it("un tamaño de página imposible es un 400", async () => {
      const { token } = await registrar();
      const cuenta = await abrirCuenta(token);

      await request(servidor)
        .get(`/accounts/${cuenta}/statement?limit=0`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
    });

    it("el extracto de otro no se lee", async () => {
      const ana = await registrar();
      const luis = await registrar();
      const suya = await abrirCuenta(luis.token);

      await request(servidor)
        .get(`/accounts/${suya}/statement`)
        .set("Authorization", `Bearer ${ana.token}`)
        .expect(404);
    });

    it("el saldo a una fecha anterior a todo es cero", async () => {
      const { token } = await registrar();
      const cuenta = await abrirCuenta(token);
      await ingresar(token, cuenta, "5000").expect(201);

      const respuesta = await request(servidor)
        .get(`/accounts/${cuenta}/balance?at=2020-01-01T00:00:00.000Z`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(respuesta.body.balance).toBe("0");
    });

    it("una fecha que no es fecha es un 400", async () => {
      const { token } = await registrar();
      const cuenta = await abrirCuenta(token);

      await request(servidor)
        .get(`/accounts/${cuenta}/balance?at=ayer`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
    });
  });

  it("un fallo inesperado no filtra la traza", async () => {
    const { token } = await registrar();

    const respuesta = await request(servidor)
      .get("/accounts/no-soy-un-uuid")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    expect(JSON.stringify(respuesta.body)).not.toContain("at ");
    expect(JSON.stringify(respuesta.body)).not.toContain(".ts:");
  });
});

/**
 * La limitación va aparte: necesita su propia aplicación, porque en las demás
 * está desactivada. Una suite que inicia sesión veinte veces se estrellaría
 * contra su propio límite.
 */
describe("limitación de intentos", () => {
  let app: INestApplication;
  let servidor: Server;

  beforeAll(async () => {
    app = await createTestingApp({ throttle: true });
    await truncateAll(app.get(PrismaService));
    servidor = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it("corta los intentos de inicio de sesión a ciegas", async () => {
    const credenciales = { email: "nadie@arca.test", password: PASSWORD };

    // Cinco fallan por credenciales; el sexto ni siquiera llega a mirarlas.
    for (let intento = 0; intento < 5; intento++) {
      await request(servidor).post("/auth/login").send(credenciales).expect(401);
    }

    await request(servidor).post("/auth/login").send(credenciales).expect(429);
  });
});
