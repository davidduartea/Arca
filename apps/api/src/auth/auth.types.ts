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
}
