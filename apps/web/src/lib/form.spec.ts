import { describe, expect, it } from "vitest";

import { text } from "./form";

describe("text", () => {
  it("devuelve lo que se escribio", () => {
    const form = new FormData();
    form.set("name", "Ahorro para el viaje");

    expect(text(form, "name")).toBe("Ahorro para el viaje");
  });

  it("devuelve cadena vacia si el campo no viene", () => {
    expect(text(new FormData(), "name")).toBe("");
  });

  /**
   * El motivo por el que esta funcion existe.
   *
   * `FormData.get()` devuelve `string | File | null`, y pasar eso por `String()`
   * convertiria un archivo en `"[object File]"` — que luego viajaria a la API
   * como si fuera lo que alguien escribio.
   */
  it("devuelve cadena vacia si lo que hay es un archivo", () => {
    const form = new FormData();
    form.set("name", new File(["cualquier cosa"], "foto.png", { type: "image/png" }));

    expect(text(form, "name")).toBe("");
  });
});
