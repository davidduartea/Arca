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
    const email = normalizeEmail(credentials.email);
    const passwordHash = await hashPassword(credentials.password);

    try {
      const user = await this.prisma.user.create({
        data: { email, passwordHash },
        select: { id: true, email: true },
      });

      return this.openSession(user);
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
    const email = normalizeEmail(credentials.email);

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!user) {
      await verifyPassword(credentials.password, await decoyHash());
      throw new InvalidCredentialsError();
    }

    const matches = await verifyPassword(credentials.password, user.passwordHash);
    if (!matches) throw new InvalidCredentialsError();

    return this.openSession({ id: user.id, email: user.email });
  }

  private async openSession(user: AuthenticatedUser): Promise<Session> {
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
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Un hash real contra el que comparar cuando el correo no existe.
 *
 * Se calcula una sola vez y se reutiliza: hacerlo en cada intento fallido
 * costaría los mismos 64 MB que un hash de verdad, y convertiría el propio
 * remedio en una forma de tumbar el servidor.
 */
let decoy: Promise<string> | undefined;

function decoyHash(): Promise<string> {
  decoy ??= hashPassword("una contraseña que no es de nadie");

  return decoy;
}
