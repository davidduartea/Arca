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
  let server: Server;

  beforeAll(async () => {
    app = await createTestingApp();
    prisma = app.get(PrismaService);
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  const register = async (email = `${randomUUID()}@arca.test`) => {
    const response = await request(server)
      .post("/auth/register")
      .send({ email, password: PASSWORD })
      .expect(201);

    return {
      email,
      token: response.body.token as string,
      userId: response.body.user.id as string,
    };
  };

  const openAccount = async (token: string, name = "Cuenta corriente") => {
    const response = await request(server)
      .post("/accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name })
      .expect(201);

    return response.body.id as string;
  };

  const deposit = (token: string, accountId: string, centavos: string) =>
    request(server)
      .post("/deposits")
      .set("Authorization", `Bearer ${token}`)
      .send({ toAccountId: accountId, amount: centavos });

  describe("registro e inicio de sesión", () => {
    it("registrarse devuelve el usuario y un token", async () => {
      const response = await request(server)
        .post("/auth/register")
        .send({ email: "ana@arca.test", password: PASSWORD })
        .expect(201);

      expect(response.body.user.email).toBe("ana@arca.test");
      expect(response.body.token).toEqual(expect.any(String));
      expect(response.body.expiresInSeconds).toBe(3600);
    });

    it("nunca devuelve el hash de la contraseña", async () => {
      const response = await request(server)
        .post("/auth/register")
        .send({ email: "ana@arca.test", password: PASSWORD })
        .expect(201);

      expect(JSON.stringify(response.body)).not.toContain("scrypt");
      expect(response.body.user.passwordHash).toBeUndefined();
    });

    it("normaliza el correo a minúsculas", async () => {
      await request(server)
        .post("/auth/register")
        .send({ email: "  Ana@Arca.Test  ", password: PASSWORD })
        .expect(201);

      // Y por tanto se puede entrar escribiéndolo de cualquier forma.
      await request(server)
        .post("/auth/login")
        .send({ email: "ANA@arca.test", password: PASSWORD })
        .expect(200);
    });

    it("no deja registrar dos veces el mismo correo", async () => {
      await register("ana@arca.test");

      await request(server)
        .post("/auth/register")
        .send({ email: "ana@arca.test", password: PASSWORD })
        .expect(409);
    });

    it("exige una contraseña larga y un correo con forma de correo", async () => {
      await request(server)
        .post("/auth/register")
        .send({ email: "ana@arca.test", password: "corta" })
        .expect(400);

      await request(server)
        .post("/auth/register")
        .send({ email: "no-es-un-correo", password: PASSWORD })
        .expect(400);
    });

    it("da la misma respuesta si falla el correo o la contraseña", async () => {
      await register("ana@arca.test");

      const wrongPassword = await request(server)
        .post("/auth/login")
        .send({ email: "ana@arca.test", password: "otra-contraseña-larga" })
        .expect(401);

      const unknownEmail = await request(server)
        .post("/auth/login")
        .send({ email: "nadie@arca.test", password: PASSWORD })
        .expect(401);

      // Distinguirlos diría a quien prueba qué correos están registrados.
      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });
  });

  describe("el guardia es global", () => {
    it("sin token no se pasa", async () => {
      await request(server).get("/accounts").expect(401);
      await request(server).get("/auth/me").expect(401);
      await request(server).post("/transfers").send({}).expect(401);
    });

    it("con un token inventado tampoco", async () => {
      await request(server)
        .get("/accounts")
        .set("Authorization", "Bearer esto.no.es")
        .expect(401);
    });

    it("y el esquema tiene que ser Bearer", async () => {
      const { token } = await register();

      await request(server).get("/accounts").set("Authorization", token).expect(401);
      await request(server).get("/accounts").set("Authorization", "Basic abc").expect(401);
    });

    it("con token válido sí", async () => {
      const { token, email } = await register();

      const response = await request(server)
        .get("/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(response.body.user.email).toBe(email);
    });
  });

  describe("cuentas", () => {
    it("una cuenta recién abierta empieza a cero", async () => {
      const { token } = await register();

      const response = await request(server)
        .post("/accounts")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Ahorro" })
        .expect(201);

      expect(response.body.name).toBe("Ahorro");
      expect(response.body.kind).toBe("USER");
      expect(response.body.balance).toBe("0");
    });

    it("no deja abrir una cuenta de sistema", async () => {
      const { token } = await register();

      const response = await request(server)
        .post("/accounts")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "Trampa", kind: "SYSTEM" })
        .expect(201);

      // El campo se ignora. Si se aceptara, cualquiera abriría una cuenta que
      // se salta la comprobación de fondos y se transferiría dinero de la nada.
      expect(response.body.kind).toBe("USER");
    });

    it("cada cual sólo ve las suyas", async () => {
      const ana = await register();
      const luis = await register();
      await openAccount(ana.token, "De Ana");
      await openAccount(luis.token, "De Luis");

      const response = await request(server)
        .get("/accounts")
        .set("Authorization", `Bearer ${ana.token}`)
        .expect(200);

      expect(response.body.accounts).toHaveLength(1);
      expect(response.body.accounts[0].name).toBe("De Ana");
    });

    it("la cuenta de otro responde 404, no 403", async () => {
      const ana = await register();
      const luis = await register();
      const theirs = await openAccount(luis.token);

      // Un 403 confirmaría que esa cuenta existe. Para quien no es el dueño,
      // sencillamente no está.
      const response = await request(server)
        .get(`/accounts/${theirs}`)
        .set("Authorization", `Bearer ${ana.token}`)
        .expect(404);

      expect(response.body.message).not.toContain("tuya");
    });

    it("una cuenta que no existe responde igual que la de otro", async () => {
      const { token } = await register();

      await request(server)
        .get(`/accounts/${randomUUID()}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });
  });

  describe("el dinero cruza el cable como texto", () => {
    it("los importes salen en centavos, como cadena", async () => {
      const { token } = await register();
      const account = await openAccount(token);
      await deposit(token, account, "10000").expect(201);

      const response = await request(server)
        .get(`/accounts/${account}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(response.body.balance).toBe("10000");
      expect(typeof response.body.balance).toBe("string");
    });

    it("un importe que llega como número JSON se rechaza", async () => {
      const { token } = await register();
      const account = await openAccount(token);

      // Aceptarlo metería el importe por un `double` de IEEE 754, y por encima
      // de 2^53 centavos el redondeo pasaría sin que nadie se entere.
      await request(server)
        .post("/deposits")
        .set("Authorization", `Bearer ${token}`)
        .send({ toAccountId: account, amount: 10000 })
        .expect(400);
    });

    it("sobrevive a importes que no caben en un entero de JavaScript", async () => {
      const { token } = await register();
      const account = await openAccount(token);
      const huge = "9007199254740993";

      await deposit(token, account, huge).expect(201);

      const response = await request(server)
        .get(`/accounts/${account}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      // Con un número JSON, esto habría vuelto como 9007199254740992.
      expect(response.body.balance).toBe(huge);
    });

    it("rechaza importes con signo o con decimales", async () => {
      const { token } = await register();
      const account = await openAccount(token);

      await deposit(token, account, "-100").expect(400);
      await deposit(token, account, "10.50").expect(400);
      await deposit(token, account, "0").expect(400);
    });
  });

  describe("transferencias", () => {
    it("mueve dinero entre cuentas", async () => {
      const ana = await register();
      const luis = await register();
      const anaAccount = await openAccount(ana.token);
      const luisAccount = await openAccount(luis.token);
      await deposit(ana.token, anaAccount, "10000").expect(201);

      const response = await request(server)
        .post("/transfers")
        .set("Authorization", `Bearer ${ana.token}`)
        .send({ fromAccountId: anaAccount, toAccountId: luisAccount, amount: "2500" })
        .expect(201);

      const entries = response.body.entries as { amount: string }[];

      expect(entries).toHaveLength(2);
      expect(entries.map((entry) => entry.amount)).toEqual(["-2500", "2500"]);
    });

    it("no se puede sacar dinero de la cuenta de otro", async () => {
      const ana = await register();
      const luis = await register();
      const anaAccount = await openAccount(ana.token);
      const luisAccount = await openAccount(luis.token);
      await deposit(luis.token, luisAccount, "10000").expect(201);

      // El control de seguridad del módulo: se puede ingresar a cualquiera,
      // pero sólo sacar de lo propio.
      await request(server)
        .post("/transfers")
        .set("Authorization", `Bearer ${ana.token}`)
        .send({ fromAccountId: luisAccount, toAccountId: anaAccount, amount: "2500" })
        .expect(404);
    });

    it("tampoco se puede ingresar en la cuenta de otro desde el mundo exterior", async () => {
      const ana = await register();
      const luis = await register();
      const luisAccount = await openAccount(luis.token);

      await deposit(ana.token, luisAccount, "10000").expect(404);
    });

    it("nadie puede usar la cuenta del mundo exterior como origen", async () => {
      const ana = await register();
      const theirs = await openAccount(ana.token);

      await request(server)
        .post("/transfers")
        .set("Authorization", `Bearer ${ana.token}`)
        .send({ fromAccountId: WORLD_ACCOUNT_ID, toAccountId: theirs, amount: "100000" })
        .expect(404);
    });

    it("sin fondos responde 409", async () => {
      const ana = await register();
      const luis = await register();
      const anaAccount = await openAccount(ana.token);
      const luisAccount = await openAccount(luis.token);
      await deposit(ana.token, anaAccount, "1000").expect(201);

      const response = await request(server)
        .post("/transfers")
        .set("Authorization", `Bearer ${ana.token}`)
        .send({ fromAccountId: anaAccount, toAccountId: luisAccount, amount: "5000" })
        .expect(409);

      expect(response.body.error).toBe("InsufficientFundsError");
    });

    it("reintentar con la misma clave no cobra dos veces", async () => {
      const ana = await register();
      const luis = await register();
      const anaAccount = await openAccount(ana.token);
      const luisAccount = await openAccount(luis.token);
      await deposit(ana.token, anaAccount, "10000").expect(201);

      const order = {
        fromAccountId: anaAccount,
        toAccountId: luisAccount,
        amount: "2500",
        idempotencyKey: randomUUID(),
      };

      const first = await request(server)
        .post("/transfers")
        .set("Authorization", `Bearer ${ana.token}`)
        .send(order)
        .expect(201);

      const retry = await request(server)
        .post("/transfers")
        .set("Authorization", `Bearer ${ana.token}`)
        .send(order)
        .expect(201);

      expect(retry.body.id).toBe(first.body.id);

      const balance = await request(server)
        .get(`/accounts/${anaAccount}`)
        .set("Authorization", `Bearer ${ana.token}`)
        .expect(200);

      expect(balance.body.balance).toBe("7500");
    });
  });

  describe("extracto", () => {
    it("devuelve las líneas con su saldo corriente", async () => {
      const { token } = await register();
      const account = await openAccount(token);
      await deposit(token, account, "5000").expect(201);
      await deposit(token, account, "3000").expect(201);

      const response = await request(server)
        .get(`/accounts/${account}/statement`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(response.body.lines).toHaveLength(2);
      expect(response.body.lines[0].balance).toBe("8000");
      expect(response.body.nextCursor).toBeNull();
    });

    it("pagina con el cursor que ella misma devuelve", async () => {
      const { token } = await register();
      const account = await openAccount(token);
      await deposit(token, account, "5000").expect(201);
      await deposit(token, account, "3000").expect(201);

      const first = await request(server)
        .get(`/accounts/${account}/statement?limit=1`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(first.body.nextCursor).toEqual(expect.any(String));

      const second = await request(server)
        .get(`/accounts/${account}/statement?limit=1&cursor=${first.body.nextCursor}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(second.body.lines[0].entryId).not.toBe(first.body.lines[0].entryId);
    });

    it("un cursor inventado es un 400", async () => {
      const { token } = await register();
      const account = await openAccount(token);

      await request(server)
        .get(`/accounts/${account}/statement?cursor=basura`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
    });

    it("un tamaño de página imposible es un 400", async () => {
      const { token } = await register();
      const account = await openAccount(token);

      await request(server)
        .get(`/accounts/${account}/statement?limit=0`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
    });

    it("el extracto de otro no se lee", async () => {
      const ana = await register();
      const luis = await register();
      const theirs = await openAccount(luis.token);

      await request(server)
        .get(`/accounts/${theirs}/statement`)
        .set("Authorization", `Bearer ${ana.token}`)
        .expect(404);
    });

    it("el saldo a una fecha anterior a todo es cero", async () => {
      const { token } = await register();
      const account = await openAccount(token);
      await deposit(token, account, "5000").expect(201);

      const response = await request(server)
        .get(`/accounts/${account}/balance?at=2020-01-01T00:00:00.000Z`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(response.body.balance).toBe("0");
    });

    it("una fecha que no es fecha es un 400", async () => {
      const { token } = await register();
      const account = await openAccount(token);

      await request(server)
        .get(`/accounts/${account}/balance?at=ayer`)
        .set("Authorization", `Bearer ${token}`)
        .expect(400);
    });
  });

  it("un fallo inesperado no filtra la traza", async () => {
    const { token } = await register();

    const response = await request(server)
      .get("/accounts/no-soy-un-uuid")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    expect(JSON.stringify(response.body)).not.toContain("at ");
    expect(JSON.stringify(response.body)).not.toContain(".ts:");
  });
});

/**
 * La limitación va aparte: necesita su propia aplicación, porque en las demás
 * está desactivada. Una suite que inicia sesión veinte veces se estrellaría
 * contra su propio límite.
 */
describe("limitación de intentos", () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    app = await createTestingApp({ throttle: true });
    await truncateAll(app.get(PrismaService));
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it("corta los intentos de inicio de sesión a ciegas", async () => {
    const credentials = { email: "nadie@arca.test", password: PASSWORD };

    // Cinco fallan por credenciales; el sexto ni siquiera llega a mirarlas.
    for (let attempt = 0; attempt < 5; attempt++) {
      await request(server).post("/auth/login").send(credentials).expect(401);
    }

    await request(server).post("/auth/login").send(credentials).expect(429);
  });
});
