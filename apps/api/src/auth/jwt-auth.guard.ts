import { CanActivate, Injectable, UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { AuthenticatedRequest } from "./current-user.decorator";
import { IS_PUBLIC } from "./public.decorator";
import { TokenService } from "./token.service";

const SCHEME = "Bearer ";

/**
 * Deja pasar sólo a quien traiga un token válido.
 *
 * Se registra como `APP_GUARD`, o sea **global**: todo está cerrado y se abre
 * con `@Public()`. Al revés, el día que alguien añade un endpoint y se olvida
 * del guardia queda abierto y nadie se entera. Con este orden, olvidarse cierra.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
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

    try {
      const payload = await this.tokens.verify(token);
      // La identidad la pone el guardia y sólo el guardia. Así ningún
      // controlador puede inventársela leyendo un parámetro o una cabecera.
      request.user = { id: payload.sub, email: payload.email };
    } catch {
      throw new UnauthorizedException("El token no es válido o ha caducado");
    }

    return true;
  }
}

function readToken(request: AuthenticatedRequest): string | null {
  const header = request.headers["authorization"];
  if (typeof header !== "string" || !header.startsWith(SCHEME)) return null;

  const token = header.slice(SCHEME.length).trim();

  return token.length > 0 ? token : null;
}
