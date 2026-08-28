export interface Credentials {
  email: string;
  password: string;
}

/** Lo que se sabe de quien hizo la petición. Nunca lleva el hash. */
export interface AuthenticatedUser {
  id: string;
  email: string;
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
