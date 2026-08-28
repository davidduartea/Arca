export abstract class AuthError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Un solo error para «no existe ese correo» y «esa no es la contraseña».
 *
 * Distinguirlos sería decirle a quien prueba qué correos están registrados, que
 * es media respuesta gratis. Por el mismo motivo el inicio de sesión gasta el
 * mismo tiempo en los dos casos.
 */
export class InvalidCredentialsError extends AuthError {
  constructor() {
    super("El correo o la contraseña no son correctos");
  }
}

/**
 * La contraseña actual que se ha escrito para autorizar el cambio no es la suya.
 *
 * Error propio y no `InvalidCredentialsError` por el código de estado que le
 * toca. Aquí la sesión es válida —el guardia ya la aceptó— y lo que falla es un
 * dato del cuerpo, así que **no puede salir un 401**: para el cliente, 401
 * significa una sola cosa, que la sesión ya no vale, y le haría cerrarla y
 * mandar a la pantalla de acceso a alguien que sólo se ha equivocado
 * escribiendo. Se traduce a 403.
 *
 * Tampoco hace falta el disimulo del inicio de sesión: quien pregunta ya ha
 * demostrado quién es, así que decirle que se ha equivocado no revela nada.
 */
export class WrongPasswordError extends AuthError {
  constructor() {
    super("Esa no es tu contraseña actual");
  }
}

/** La nueva es la de siempre: cerraría todas las sesiones sin cambiar nada. */
export class SamePasswordError extends AuthError {
  constructor() {
    super("La contraseña nueva tiene que ser distinta de la actual");
  }
}

export class EmailAlreadyRegisteredError extends AuthError {
  constructor(readonly email: string) {
    super(`Ya hay una cuenta con el correo ${email}`);
  }
}

/** La cuenta existe, pero no es de quien pregunta. */
export class NotYourAccountError extends AuthError {
  constructor(readonly accountId: string) {
    super(`La cuenta ${accountId} no es tuya`);
  }
}
