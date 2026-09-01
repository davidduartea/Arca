import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";

import { ZodValidationPipe } from "../http/zod-validation.pipe";
import { CurrentUser } from "./current-user.decorator";
import { AuthService } from "./auth.service";
import type {
  AuthenticatedUser,
  Credentials,
  NameChange,
  PasswordChange,
  Registration,
  Session,
} from "./auth.types";
import { Public } from "./public.decorator";

/**
 * Validar un correo con una expresión regular es teatro: la única comprobación
 * de verdad es que llegue un mensaje a esa dirección. Aquí sólo se descartan
 * los que no pueden ser, y se pone un tope de longitud — sin él, alguien manda
 * un campo de diez megas y lo hasheamos nosotros.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Doce caracteres y ninguna regla de composición.
 *
 * Obligar a mayúsculas y símbolos produce «Password1!» una y otra vez; la
 * longitud es lo que manda, y es lo que recomienda el NIST desde hace años. El
 * tope existe para que nadie mande un campo de diez megas y lo hasheemos.
 */
const PASSWORD = z.string().min(12, "hacen falta al menos 12 caracteres").max(200);

/**
 * El nombre de la persona.
 *
 * Ochenta caracteres, como el de una cuenta, y sin más reglas: no se comprueba
 * que «parezca» un nombre porque los nombres del mundo no caben en ninguna
 * expresión regular — apellidos con apóstrofo, con guiones, en otro alfabeto, de
 * una sola letra. Lo único que se exige es que no esté en blanco, que es lo que
 * dejaría un hueco donde alguien espera ver a quién le manda el dinero.
 */
const PERSON_NAME = z.string().trim().min(1, "hace falta un nombre").max(80);

const credentialsSchema = z.object({
  email: z.string().trim().max(254).regex(EMAIL_SHAPE, "no parece un correo"),
  password: PASSWORD,
});

const registrationSchema = credentialsSchema.extend({ name: PERSON_NAME });

const nameChangeSchema = z.strictObject({ name: PERSON_NAME });

const passwordChangeSchema = z.object({
  // La actual sólo tiene que estar. Medirla con la regla de arriba rechazaría
  // por corta una contraseña que de verdad es la suya, y el mensaje hablaría de
  // la longitud cuando el problema es otro.
  currentPassword: z.string().min(1, "hace falta tu contraseña actual").max(200),
  newPassword: PASSWORD,
});

/** Cinco intentos por minuto: suficiente para quien se equivoca, inútil para probar a ciegas. */
const ATTEMPT_LIMIT = { default: { limit: 5, ttl: 60_000 } };

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(ATTEMPT_LIMIT)
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  register(
    @Body(new ZodValidationPipe(registrationSchema)) body: Registration,
  ): Promise<Session> {
    return this.auth.register(body);
  }

  @Public()
  @Throttle(ATTEMPT_LIMIT)
  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body(new ZodValidationPipe(credentialsSchema)) body: Credentials): Promise<Session> {
    return this.auth.login(body);
  }

  /** Para que el cliente sepa si su token sigue valiendo, sin adivinarlo. */
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser): { user: AuthenticatedUser } {
    return { user };
  }

  /**
   * Cambia el nombre. Sin contraseña y sin cerrar nada.
   *
   * No devuelve sesión nueva porque no hace falta ninguna: el nombre no va
   * firmado dentro del token, se relee de la base en cada petición.
   */
  @Patch("name")
  @HttpCode(HttpStatus.OK)
  async changeName(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(nameChangeSchema)) body: NameChange,
  ): Promise<{ user: AuthenticatedUser }> {
    return { user: await this.auth.changeName(user.id, body) };
  }

  /**
   * Cambia la contraseña y devuelve una sesión nueva.
   *
   * Con el mismo tope de intentos que el inicio de sesión: aquí también se
   * adivina una contraseña, con la diferencia de que quien lo intenta ya está
   * dentro — que es justo el caso de un token robado buscando quedarse.
   */
  @Throttle(ATTEMPT_LIMIT)
  @Patch("password")
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(passwordChangeSchema)) body: PasswordChange,
  ): Promise<Session> {
    return this.auth.changePassword(user.id, body);
  }

  /**
   * Cierra todas las sesiones, incluida la de quien lo pide.
   *
   * Sin cuerpo en la respuesta porque no hay nada que devolver: el token con el
   * que se ha hecho esta llamada ya no vale para la siguiente.
   */
  @Post("logout-all")
  @HttpCode(HttpStatus.NO_CONTENT)
  async closeAllSessions(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.auth.closeAllSessions(user.id);
  }
}
