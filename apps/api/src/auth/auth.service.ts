import { Injectable } from "@nestjs/common";

import { isUniqueViolationOn } from "../prisma/postgres-errors";
import { PrismaService } from "../prisma/prisma.service";
import { EmailAlreadyRegisteredError, InvalidCredentialsError } from "./auth.errors";
import type { AuthenticatedUser, Credentials, Session } from "./auth.types";
import { hashPassword, verifyPassword } from "./password";
import { TOKEN_TTL_SECONDS, TokenService } from "./token.service";

/**
 * Registro e inicio de sesión.
 *
 * Deliberadamente pequeño: un token de acceso y nada más. No hay refresh
 * rotatorio, ni lista de sesiones, ni cierre de sesión que invalide de verdad —
 * y eso significa que un token robado sirve hasta que caduque. Se compensa
 * acortando su vida a una hora, y está anotado como lo que es: una decisión de
 * alcance, no un descuido.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async register(credentials: Credentials): Promise<Session> {
    const email = normalizar(credentials.email);
    const passwordHash = await hashPassword(credentials.password);

    try {
      const usuario = await this.prisma.user.create({
        data: { email, passwordHash },
        select: { id: true, email: true },
      });

      return this.abrirSesion(usuario);
    } catch (error) {
      // El índice único es la garantía; comprobar antes sería una carrera.
      if (isUniqueViolationOn(error, "email")) throw new EmailAlreadyRegisteredError(email);

      throw error;
    }
  }

  /**
   * Inicia sesión, tardando lo mismo exista el correo o no.
   *
   * Si al no encontrar el correo se volviera de inmediato, el reloj contestaría
   * una pregunta que nadie ha hecho: qué correos están registrados. Unos
   * milisegundos de diferencia bastan para recorrer una lista de direcciones y
   * saber cuáles son clientes.
   */
  async login(credentials: Credentials): Promise<Session> {
    const email = normalizar(credentials.email);

    const usuario = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!usuario) {
      await verifyPassword(credentials.password, await hashSenuelo());
      throw new InvalidCredentialsError();
    }

    const correcta = await verifyPassword(credentials.password, usuario.passwordHash);
    if (!correcta) throw new InvalidCredentialsError();

    return this.abrirSesion({ id: usuario.id, email: usuario.email });
  }

  private async abrirSesion(user: AuthenticatedUser): Promise<Session> {
    return {
      user,
      token: await this.tokens.issue(user),
      expiresInSeconds: TOKEN_TTL_SECONDS,
    };
  }
}

/**
 * `Ana@X.com` y `ana@x.com` son la misma persona.
 *
 * Sin normalizar, el índice único dejaría registrar las dos y quien volviera
 * escribiéndolo distinto no encontraría su cuenta. La base también lo exige:
 * hay un `CHECK (email = lower(email))`.
 */
function normalizar(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Un hash real contra el que comparar cuando el correo no existe.
 *
 * Se calcula una sola vez y se reutiliza: hacerlo en cada intento fallido
 * costaría los mismos 64 MB que un hash de verdad, y convertiría el propio
 * remedio en una forma de tumbar el servidor.
 */
let senuelo: Promise<string> | undefined;

function hashSenuelo(): Promise<string> {
  senuelo ??= hashPassword("una contraseña que no es de nadie");

  return senuelo;
}
