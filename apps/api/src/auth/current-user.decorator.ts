import { createParamDecorator } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";

import type { AuthenticatedUser } from "./auth.types";

/** La petición, una vez el guardia ha dejado pasar a alguien. */
export interface AuthenticatedRequest {
  user?: AuthenticatedUser;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Quien hace la petición, sacado del token que ya validó el guardia.
 *
 * Que sea el guardia quien lo pone y esto sólo lo lea es lo que evita que un
 * controlador se invente la identidad leyendo un parámetro o una cabecera.
 */
export const CurrentUser = createParamDecorator(
  (_datos: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new Error("No hay usuario en la petición: ¿falta el guardia?");
    }

    return request.user;
  },
);
