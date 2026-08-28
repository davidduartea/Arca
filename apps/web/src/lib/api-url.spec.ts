import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * La direccion se resuelve **al cargar el modulo**, no en cada peticion: si
 * falta, mejor no levantar. Por eso cada caso vuelve a importarlo desde cero
 * con `resetModules`, que es la unica forma de volver a ejecutar ese momento.
 */
async function loadWith(url: string | undefined) {
  vi.resetModules();
  vi.stubEnv("API_URL", url ?? "");

  return import("./api-url");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("API_URL", () => {
  it("devuelve la direccion tal cual", async () => {
    expect((await loadWith("http://libro.test")).API_URL).toBe("http://libro.test");
  });

  /** Sin esto, cada ruta acabaria con una barra de mas: `http://x//accounts`. */
  it("quita las barras del final", async () => {
    expect((await loadWith("http://libro.test/")).API_URL).toBe("http://libro.test");
    expect((await loadWith("http://libro.test///")).API_URL).toBe("http://libro.test");
  });

  it("conserva un prefijo de ruta, que no es una barra suelta", async () => {
    expect((await loadWith("http://libro.test/api/v1")).API_URL).toBe(
      "http://libro.test/api/v1",
    );
  });

  it("no levanta si falta, y el mensaje explica el porque del nombre", async () => {
    await expect(loadWith(undefined)).rejects.toThrow(/NEXT_PUBLIC/u);
  });
});
