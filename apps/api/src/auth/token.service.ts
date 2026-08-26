import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import type { AuthenticatedUser, TokenPayload } from "./auth.types";

/** Token de inyección, para que los tests puedan firmar con otro secreto. */
export const JWT_SECRET = Symbol("JWT_SECRET");

/**
 * Una hora.
 *
 * Corto porque este token **no se puede revocar**: una vez firmado vale hasta
 * que caduca, aunque se cierre la sesión o se cambie la contraseña. La respuesta
 * completa a eso es un refresh rotatorio con lista de sesiones en base de datos;
 * mientras no exista, la ventana de daño se limita acortando la vida.
 */
export const TOKEN_TTL_SECONDS = 3600;

@Injectable()
export class TokenService {
  private readonly jwt: JwtService;

  constructor(@Inject(JWT_SECRET) secret: string) {
    // Se construye a mano en vez de con `JwtModule.registerAsync` para que el
    // secreto entre por inyección como cualquier otra dependencia, y se pueda
    // sustituir en los tests sin montar un módulo distinto.
    this.jwt = new JwtService({
      secret,
      signOptions: { expiresIn: TOKEN_TTL_SECONDS, algorithm: "HS256" },
      verifyOptions: { algorithms: ["HS256"] },
    });
  }

  async issue(user: AuthenticatedUser): Promise<string> {
    const payload: TokenPayload = { sub: user.id, email: user.email };

    return this.jwt.signAsync(payload);
  }

  /**
   * Devuelve lo que va dentro del token, o lanza.
   *
   * `algorithms: ["HS256"]` no es redundante. Sin fijarlo, un atacante puede
   * cambiar la cabecera del token a `alg: none` o a un algoritmo distinto y
   * algunas librerías se lo creen: es la confusión de algoritmos, y ha abierto
   * unas cuantas APIs de verdad.
   */
  async verify(token: string): Promise<TokenPayload> {
    return this.jwt.verifyAsync<TokenPayload>(token);
  }
}
