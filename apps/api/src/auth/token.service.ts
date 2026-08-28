import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import type { AuthenticatedUser, TokenPayload } from "./auth.types";

/** Token de inyección, para que los tests puedan firmar con otro secreto. */
export const JWT_SECRET = Symbol("JWT_SECRET");

/**
 * Una hora.
 *
 * Ya no es la única defensa: desde que el token lleva dentro una versión de
 * sesión, se puede echar antes de tiempo subiendo la de su dueño. Sigue siendo
 * corta porque son cosas distintas — la revocación necesita que alguien la
 * dispare, y la caducidad no necesita a nadie.
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

  /**
   * Firma un token para este usuario, atado a su versión de sesión.
   *
   * La versión entra aquí y no se lee dentro: quien la conoce es el servicio
   * que acaba de hablar con la base, y hacer que este pregunte por su cuenta
   * añadiría una consulta a algo que sólo tiene que firmar.
   */
  async issue(user: AuthenticatedUser, tokenVersion: number): Promise<string> {
    const payload: TokenPayload = { sub: user.id, email: user.email, ver: tokenVersion };

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
