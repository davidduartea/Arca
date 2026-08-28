import { CanActivate, Injectable, UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AuthService } from "./auth.service";
import type { TokenPayload } from "./auth.types";
import type { AuthenticatedRequest } from "./current-user.decorator";
import { IS_PUBLIC } from "./public.decorator";
import { TokenService } from "./token.service";

const SCHEME = "Bearer ";

/**
 * Deja pasar sólo a quien traiga un token válido y una sesión que siga abierta.
 *
 * Se registra como `APP_GUARD`, o sea **global**: todo está cerrado y se abre
 * con `@Public()`. Al revés, el día que alguien añade un endpoint y se olvida
 * del guardia queda abierto y nadie se entera. Con este orden, olvidarse cierra.
 *
 * Son dos comprobaciones y no una. La firma dice que el token lo emitimos
 * nosotros y que no ha caducado; eso se resuelve sin salir del proceso. La
 * segunda dice que la sesión no se ha cerrado desde entonces, y ésa **exige ir
 * a la base**: no hay manera de enterarse de algo que pasó después de firmar
 * sin preguntar por ello.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readToken(request);
    if (token === null) throw new UnauthorizedException("Falta el token de acceso");

    let payload: TokenPayload;
    try {
      payload = await this.tokens.verify(token);
    } catch {
      throw new UnauthorizedException("El token no es válido o ha caducado");
    }

    // La consulta va **fuera** del `try`. Dentro, una base caída se convertiría
    // en «tu token no vale»: echaría a todo el mundo y escondería la avería
    // detrás de un 401 que nadie va a ir a mirar. Que reviente como un 500.
    const user = await this.auth.authenticate(payload);
    if (user === null) throw new UnauthorizedException("La sesión se ha cerrado");

    // La identidad la pone el guardia y sólo el guardia. Así ningún controlador
    // puede inventársela leyendo un parámetro o una cabecera.
    request.user = user;

    return true;
  }
}

function readToken(request: AuthenticatedRequest): string | null {
  const header = request.headers["authorization"];
  if (typeof header !== "string" || !header.startsWith(SCHEME)) return null;

  const token = header.slice(SCHEME.length).trim();

  return token.length > 0 ? token : null;
}
