import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearDraft, readDraft, writeDraft } from "./draft";

/**
 * Aquí no hay navegador, así que `sessionStorage` se pone a mano.
 *
 * No es un doble sofisticado a propósito: lo que hay que comprobar no es que
 * `Storage` funcione —eso ya lo hace el navegador— sino que este módulo aguante
 * lo que le devuelva, incluido que le devuelva basura o que reviente.
 */
function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));

  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    items,
  };
}

/** Lo que hace el navegador en modo privado con el almacenamiento bloqueado. */
const throwingStorage = {
  getItem: () => {
    throw new DOMException("acceso denegado");
  },
  setItem: () => {
    throw new DOMException("acceso denegado");
  },
  removeItem: () => {
    throw new DOMException("acceso denegado");
  },
};

beforeEach(() => {
  vi.stubGlobal("sessionStorage", fakeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("borradores", () => {
  it("lo que se guarda se recupera", () => {
    writeDraft("mover", { amount: "12.50", description: "Alquiler" });

    expect(readDraft("mover")).toEqual({ amount: "12.50", description: "Alquiler" });
  });

  it("sin nada guardado devuelve null, no un objeto vacío", () => {
    expect(readDraft("mover")).toBeNull();
  });

  it("borrar lo quita", () => {
    writeDraft("mover", { amount: "12.50" });
    clearDraft("mover");

    expect(readDraft("mover")).toBeNull();
  });

  it("cada clave es la suya", () => {
    writeDraft("transferir", { amount: "1" });
    writeDraft("ingresar", { amount: "2" });

    expect(readDraft("transferir")).toEqual({ amount: "1" });
    expect(readDraft("ingresar")).toEqual({ amount: "2" });
  });

  /**
   * Lo de dentro lo escribimos nosotros, pero cualquiera puede editarlo desde
   * las herramientas del navegador. Nada de eso debe acabar repartido por los
   * campos de un formulario de dinero.
   */
  describe("lo que hay dentro no se da por bueno", () => {
    it.each([
      ["JSON roto", "{no es json"],
      ["una cadena", '"caballo"'],
      ["un número", "42"],
      ["null", "null"],
      ["un array", '["a","b"]'],
    ])("%s se descarta", (_caso, raw) => {
      vi.stubGlobal("sessionStorage", fakeStorage({ mover: raw }));

      expect(readDraft("mover")).toBeNull();
    });
  });

  /**
   * Perder el borrador es un contratiempo. Dejar la pantalla en blanco por
   * intentar guardarlo sería mucho peor, y pasa de verdad: en navegación
   * privada, con el almacenamiento del sitio bloqueado, hasta leer lanza.
   */
  describe("cuando el almacenamiento no está disponible", () => {
    beforeEach(() => {
      vi.stubGlobal("sessionStorage", throwingStorage);
    });

    it("leer devuelve null en vez de lanzar", () => {
      expect(() => readDraft("mover")).not.toThrow();
      expect(readDraft("mover")).toBeNull();
    });

    it("guardar no lanza", () => {
      expect(() => {
        writeDraft("mover", { amount: "1" });
      }).not.toThrow();
    });

    it("borrar no lanza", () => {
      expect(() => {
        clearDraft("mover");
      }).not.toThrow();
    });
  });

  /** En el servidor la variable no existe siquiera, y esto corre en el servidor. */
  it("sin `sessionStorage` en el entorno, tampoco lanza", () => {
    vi.unstubAllGlobals();

    expect(readDraft("mover")).toBeNull();
    expect(() => {
      writeDraft("mover", { amount: "1" });
    }).not.toThrow();
    expect(() => {
      clearDraft("mover");
    }).not.toThrow();
  });
});
