import { Body, Controller, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";

import { ZodValidationPipe } from "../http/zod-validation.pipe";
import { CurrentUser } from "./current-user.decorator";
import { AuthService } from "./auth.service";
import type { AuthenticatedUser, Credentials, Session } from "./auth.types";
import { Public } from "./public.decorator";

/**
 * Validar un correo con una expresión regular es teatro: la única comprobación
 * de verdad es que llegue un mensaje a esa dirección. Aquí sólo se descartan
 * los que no pueden ser, y se pone un tope de longitud — sin él, alguien manda
 * un campo de diez megas y lo hasheamos nosotros.
 */
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const credenciales = z.object({
  email: z.string().trim().max(254).regex(CORREO, "no parece un correo"),

  // Doce caracteres y ninguna regla de composición. Obligar a mayúsculas y
  // símbolos produce «Password1!» una y otra vez; la longitud es lo que manda,
  // y es lo que recomienda el NIST desde hace años.
  password: z.string().min(12, "hacen falta al menos 12 caracteres").max(200),
});

/** Cinco intentos por minuto: suficiente para quien se equivoca, inútil para probar a ciegas. */
const LIMITE_DE_INTENTOS = { default: { limit: 5, ttl: 60_000 } };

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(LIMITE_DE_INTENTOS)
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  register(@Body(new ZodValidationPipe(credenciales)) body: Credentials): Promise<Session> {
    return this.auth.register(body);
  }

  @Public()
  @Throttle(LIMITE_DE_INTENTOS)
  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body(new ZodValidationPipe(credenciales)) body: Credentials): Promise<Session> {
    return this.auth.login(body);
  }

  /** Para que el cliente sepa si su token sigue valiendo, sin adivinarlo. */
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser): { user: AuthenticatedUser } {
    return { user };
  }
}
