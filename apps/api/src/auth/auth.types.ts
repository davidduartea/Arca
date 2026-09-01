export interface Credentials {
  email: string;
  password: string;
}

/** Para abrir cuenta hace falta además un nombre: es lo que verá quien te pague. */
export interface Registration extends Credentials {
  name: string;
}

/** Lo que se sabe de quien hizo la petición. Nunca lleva el hash. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

export interface Session {
  user: AuthenticatedUser;
  token: string;
  expiresInSeconds: number;
}

/** Lo que va firmado dentro del token. */
export interface TokenPayload {
  sub: string;
  email: string;

  /**
   * La versión de sesión que tenía el usuario cuando se emitió.
   *
   * Nombre corto porque va dentro del token y el token viaja en una cabecera en
   * cada petición. `ver` y no `tokenVersion` ahorra diez bytes por llamada, que
   * es la misma razón por la que el estándar usa `sub`, `exp` e `iat`.
   */
  ver: number;
}

/** Cambiar la contraseña: hay que demostrar que se sabe la de ahora. */
export interface PasswordChange {
  currentPassword: string;
  newPassword: string;
}

/**
 * Cambiar el nombre.
 *
 * Sin contraseña, a diferencia del cambio de contraseña: esto no da acceso a
 * nada ni se lo quita a nadie. Lo que sí hace es cambiar lo que ve quien vaya a
 * mandarte dinero, y por eso existe — a las cuentas creadas antes de que
 * hubiera nombre se les puso la parte del correo anterior a la arroba, y un
 * nombre puesto por la máquina que no se pueda corregir es peor que ninguno.
 */
export interface NameChange {
  name: string;
}
