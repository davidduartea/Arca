import type { User } from "@/models/auth/User";

/** Lo que devuelve la API al entrar. El token nunca sale de aquí: va a la cookie. */
export interface Session {
  user: User;
  token: string;
  expiresInSeconds: number;
}
