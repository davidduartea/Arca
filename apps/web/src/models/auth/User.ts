/** Quien abre cuentas y mueve dinero. */
export interface User {
  id: string;
  email: string;

  /**
   * Cómo se llama.
   *
   * Es lo que ve quien teclea su número de arca antes de mandarle dinero. No lo
   * identifica —dos personas pueden llamarse igual, y el número es el que
   * distingue— pero es lo que convierte doce cifras en alguien.
   */
  name: string;
}
