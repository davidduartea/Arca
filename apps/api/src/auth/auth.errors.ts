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
