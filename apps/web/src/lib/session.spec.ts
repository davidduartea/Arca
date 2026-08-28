import { beforeEach, describe, expect, it, vi } from "vitest";

/** El tarro de galletas de Next, sustituido por uno que se deja mirar. */
const jar = {
  set: vi.fn<(name: string, value: string, options: Record<string, unknown>) => void>(),
  get: vi.fn<(name: string) => { value: string } | undefined>(),
};

vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(jar) }));

beforeEach(() => {
  vi.clearAllMocks();
});

/** Vuelve a cargar el modulo: `secure` se decide al evaluarlo, no en cada llamada. */
async function loadIn(environment: string) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", environment);

  return import("./session");
}

describe("writeSession", () => {
  it("guarda el token con el nombre que espera el proxy", async () => {
    const { writeSession, SESSION_COOKIE } = await import("./session");

    await writeSession("un.token.cualquiera", 3600);

    const [name, value] = jar.set.mock.calls[0] ?? [];

    expect(name).toBe(SESSION_COOKIE);
    expect(value).toBe("un.token.cualquiera");
  });

  /**
   * Las tres que la protegen. `httpOnly` es la que importa de verdad: aunque
   * alguien logre inyectar un script, no puede leer el token ni mandarselo a
   * nadie. `sameSite: lax` es la mitad del trabajo contra CSRF.
   */
  it("la marca httpOnly, sameSite lax y para todo el sitio", async () => {
    const { writeSession } = await import("./session");

    await writeSession("t", 3600);

    expect(jar.set.mock.calls[0]?.[2]).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 3600,
    });
  });

  it("la marca secure en produccion", async () => {
    const { writeSession } = await loadIn("production");

    await writeSession("t", 60);

    expect(jar.set.mock.calls[0]?.[2]).toMatchObject({ secure: true });
  });

  /** En desarrollo no: `secure` impide que el navegador la mande por http. */
  it("no la marca secure fuera de produccion", async () => {
    const { writeSession } = await loadIn("development");

    await writeSession("t", 60);

    expect(jar.set.mock.calls[0]?.[2]).toMatchObject({ secure: false });
  });
});

describe("clearSession", () => {
  /**
   * Se vacia con maxAge 0 y las mismas opciones, no se borra a secas: el
   * navegador solo reemplaza una cookie si el nombre, la ruta y el resto de
   * atributos coinciden con los que tenia.
   */
  it("la vacia caducandola con las mismas opciones", async () => {
    const { clearSession, SESSION_COOKIE } = await import("./session");

    await clearSession();

    const [name, value, options] = jar.set.mock.calls[0] ?? [];

    expect(name).toBe(SESSION_COOKIE);
    expect(value).toBe("");
    expect(options).toMatchObject({ maxAge: 0, httpOnly: true, sameSite: "lax", path: "/" });
  });
});

describe("readToken", () => {
  it("devuelve el token cuando la cookie esta", async () => {
    const { readToken } = await import("./session");
    jar.get.mockReturnValue({ value: "un.token.cualquiera" });

    await expect(readToken()).resolves.toBe("un.token.cualquiera");
  });

  it("devuelve undefined cuando no hay sesion", async () => {
    const { readToken } = await import("./session");
    jar.get.mockReturnValue(undefined);

    await expect(readToken()).resolves.toBeUndefined();
  });
});
