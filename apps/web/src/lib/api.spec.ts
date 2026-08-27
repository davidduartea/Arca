import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, api } from "./api";

vi.mock("@/lib/session", () => ({ readToken: vi.fn() }));

const { readToken } = await import("@/lib/session");
const readTokenMock = vi.mocked(readToken);

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);

/** Una respuesta de la API, con lo minimo para que `api()` la sepa leer. */
function respond(status: number, payload: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(payload),
  } as Response;
}

/** Una API caida: contesta, pero lo que contesta no es JSON. */
function garbage(status: number): Response {
  return {
    status,
    ok: false,
    json: () => Promise.reject(new SyntaxError("no es JSON")),
  } as Response;
}

function lastRequest(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1);

  if (!call) throw new Error("No se llego a llamar a fetch");

  const [url, init] = call;

  // `fetch` acepta tambien un `Request`, pero `api()` siempre le pasa una
  // cadena. Comprobarlo es lo que hace que el resto de las aserciones digan
  // algo: si un dia dejara de ser texto, esto se entera aqui y no mas abajo.
  if (typeof url !== "string") throw new Error("Se esperaba una direccion en texto");

  return { url, init: init ?? {} };
}

beforeEach(() => {
  vi.clearAllMocks();
  readTokenMock.mockResolvedValue(undefined);
});

describe("api", () => {
  it("pide contra la direccion del backend y devuelve lo que llega", async () => {
    fetchMock.mockResolvedValue(respond(200, { accounts: [] }));

    await expect(api("/accounts")).resolves.toEqual({ accounts: [] });
    expect(lastRequest().url).toBe("http://libro.test/accounts");
  });

  /**
   * Un saldo cacheado es un saldo mentiroso, y aqui es el dato central. Next
   * cachearia por su cuenta si no se le dijera lo contrario.
   */
  it("no cachea las lecturas", async () => {
    fetchMock.mockResolvedValue(respond(200, {}));

    await api("/accounts");

    expect(lastRequest().init).toMatchObject({ method: "GET", cache: "no-store" });
    expect(lastRequest().init.next).toBeUndefined();
  });

  it("deja cachear cuando se le pide un plazo", async () => {
    fetchMock.mockResolvedValue(respond(200, {}));

    await api("/accounts", { revalidate: 60 });

    expect(lastRequest().init.cache).toBeUndefined();
    expect(lastRequest().init).toMatchObject({ next: { revalidate: 60 } });
  });

  it("adjunta el token de la cookie", async () => {
    readTokenMock.mockResolvedValue("un.token.cualquiera");
    fetchMock.mockResolvedValue(respond(200, {}));

    await api("/accounts");

    expect(lastRequest().init.headers).toMatchObject({
      Authorization: "Bearer un.token.cualquiera",
      Accept: "application/json",
    });
  });

  /** Registro y acceso son las unicas sin sesion: pedirla ahi no tendria sentido. */
  it("no lo adjunta ni lo lee en una peticion anonima", async () => {
    readTokenMock.mockResolvedValue("un.token.cualquiera");
    fetchMock.mockResolvedValue(respond(200, {}));

    await api("/auth/login", { method: "POST", body: {}, anonymous: true });

    expect(readTokenMock).not.toHaveBeenCalled();
    expect(lastRequest().init.headers).not.toHaveProperty("Authorization");
  });

  it("no adjunta nada si no hay sesion todavia", async () => {
    fetchMock.mockResolvedValue(respond(200, {}));

    await api("/accounts");

    expect(lastRequest().init.headers).not.toHaveProperty("Authorization");
  });

  it("serializa el cuerpo y anuncia que va JSON", async () => {
    fetchMock.mockResolvedValue(respond(200, {}));

    await api("/accounts", { method: "POST", body: { name: "Ahorro" } });

    expect(lastRequest().init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ name: "Ahorro" }),
    });
    expect(lastRequest().init.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("no manda cuerpo ni Content-Type cuando no hay nada que mandar", async () => {
    fetchMock.mockResolvedValue(respond(200, {}));

    await api("/accounts");

    expect(lastRequest().init.body).toBeUndefined();
    expect(lastRequest().init.headers).not.toHaveProperty("Content-Type");
  });

  /** Un 204 no trae cuerpo: intentar leerlo como JSON reventaria. */
  it("devuelve undefined ante un 204, sin leer el cuerpo", async () => {
    const json = vi.fn();
    fetchMock.mockResolvedValue({ status: 204, ok: true, json } as unknown as Response);

    await expect(api("/algo")).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });
});

describe("ApiError", () => {
  it("lleva el estado, el codigo de dominio y el mensaje", async () => {
    fetchMock.mockResolvedValue(
      respond(409, { error: "InsufficientFundsError", message: "No hay bastante." }),
    );

    const failure = await api("/transfers").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      name: "ApiError",
      status: 409,
      message: "No hay bastante.",
    });
    expect((failure as ApiError).code).toBe("InsufficientFundsError");
  });

  it("propaga los problemas por campo que manda el validador", async () => {
    fetchMock.mockResolvedValue(
      respond(400, {
        error: "ValidationError",
        message: "Revisa los datos.",
        issues: [{ field: "email", message: "No parece un correo." }],
      }),
    );

    const failure = (await api("/auth/register").catch((e: unknown) => e)) as ApiError;

    expect(failure.failure.issues).toEqual([
      { field: "email", message: "No parece un correo." },
    ]);
  });

  /**
   * Si la API se cae del todo, la respuesta puede no ser ni JSON. Que eso acabe
   * en un «no se pudo conectar» y no en un `TypeError` sin contexto es la
   * diferencia entre una pantalla que explica y una que se queda en blanco.
   */
  it("sobrevive a una respuesta que no es JSON", async () => {
    fetchMock.mockResolvedValue(garbage(502));

    const failure = (await api("/accounts").catch((e: unknown) => e)) as ApiError;

    expect(failure.status).toBe(502);
    expect(failure.code).toBe("HTTP502");
    expect(failure.message).toBe("No se pudo conectar con el libro.");
  });

  it("rellena lo que falte cuando el JSON no trae los campos de siempre", async () => {
    fetchMock.mockResolvedValue(respond(500, { algo: "raro" }));

    const failure = (await api("/accounts").catch((e: unknown) => e)) as ApiError;

    expect(failure.code).toBe("HTTP500");
    expect(failure.message).toBe("No se pudo completar.");
    expect(failure.failure.issues).toBeUndefined();
  });
});
