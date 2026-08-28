import { Injectable } from "@nestjs/common";

import { isUniqueViolationOn } from "../prisma/postgres-errors";
import { PrismaService } from "../prisma/prisma.service";
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  SamePasswordError,
  WrongPasswordError,
} from "./auth.errors";
import type {
  AuthenticatedUser,
  Credentials,
  PasswordChange,
  Session,
  TokenPayload,
} from "./auth.types";
import { hashPassword, verifyPassword } from "./password";
import { TOKEN_TTL_SECONDS, TokenService } from "./token.service";

/**
 * Registro, inicio de sesión y todo lo que cierra sesiones.
 *
 * Sigue siendo pequeño: un token de acceso, sin refresh rotatorio ni lista de
 * dispositivos. Lo que ya no falta es poder **echar** a un token antes de que
 * caduque, que era el agujero de verdad — hasta ahora, cambiar la contraseña
 * dejaba dentro a quien te la hubiera robado.
 *
 * El mecanismo es un contador por usuario, `tokenVersion`. Va firmado dentro
 * del token y el guardia lo compara en cada petición: subirlo invalida de golpe
 * todo lo emitido hasta ese momento. Lo que no da es granularidad — se echa a
 * todos o a ninguno—, y las dos acciones que existen quieren exactamente eso.
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
        select: { id: true, email: true, tokenVersion: true },
      });

      return this.openSession(user, user.tokenVersion);
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
      select: { id: true, email: true, passwordHash: true, tokenVersion: true },
    });

    if (!user) {
      await verifyPassword(credentials.password, await decoyHash());
      throw new InvalidCredentialsError();
    }

    const matches = await verifyPassword(credentials.password, user.passwordHash);
    if (!matches) throw new InvalidCredentialsError();

    return this.openSession({ id: user.id, email: user.email }, user.tokenVersion);
  }

  /**
   * Quién es quien trae este token, si es que todavía es alguien.
   *
   * Lo llama el guardia en cada petición. Devuelve `null` —y no lanza— porque
   * aquí no hay una sola forma de no valer: la sesión pudo cerrarse, la
   * contraseña cambiarse, o el usuario dejar de existir. Las tres acaban en el
   * mismo 401 y el guardia es quien decide cómo se cuenta.
   *
   * Un token emitido antes de que existiera la versión no trae `ver`, así que
   * no coincide con ningún número y queda fuera. Es lo correcto: precede a la
   * revocación y no hay forma de saber si sigue estando en buenas manos. El
   * coste es que al desplegar esto todo el mundo vuelve a entrar una vez.
   */
  async authenticate(payload: TokenPayload): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, tokenVersion: true },
    });

    if (!user) return null;
    if (user.tokenVersion !== payload.ver) return null;

    // El correo sale de la base y no del token: si cambiara, lo firmado se
    // quedaría viejo y el resto de la aplicación leería una dirección que ya no
    // es la suya.
    return { id: user.id, email: user.email };
  }

  /**
   * Cambia la contraseña y echa a todas las demás sesiones.
   *
   * Echarlas es la mitad del sentido de cambiarla. Si alguien entró con la
   * anterior, dejar vivos sus tokens convierte el cambio en un gesto: seguiría
   * dentro hasta una hora, y con margen de sobra para abrirse otra puerta.
   *
   * A quien la cambia se le devuelve un token nuevo, porque el suyo acaba de
   * quedar invalidado con los demás y sería absurdo echarle de su propia
   * pantalla por cuidar de su cuenta.
   */
  async changePassword(userId: string, change: PasswordChange): Promise<Session> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, passwordHash: true },
    });

    // El guardia ya comprobó que existe. Esto es el cinturón por si algún día
    // se llama desde otro sitio.
    if (!user) throw new InvalidCredentialsError();

    const matches = await verifyPassword(change.currentPassword, user.passwordHash);
    if (!matches) throw new WrongPasswordError();

    // Contra el mismo hash: si la nueva también encaja, es que no ha cambiado.
    // Dejarlo pasar cerraría todas las sesiones a cambio de nada.
    if (await verifyPassword(change.newPassword, user.passwordHash)) {
      throw new SamePasswordError();
    }

    const passwordHash = await hashPassword(change.newPassword);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
      select: { id: true, email: true, tokenVersion: true },
    });

    return this.openSession({ id: updated.id, email: updated.email }, updated.tokenVersion);
  }

  /**
   * Cierra todas las sesiones, la de quien lo pide incluida.
   *
   * Es lo que dice el botón, y es lo honesto: quien lo pulsa sospecha que hay
   * alguien dentro y quiere quedarse solo. Dejarse a uno mismo abierto obligaría
   * a decidir cuál de los dos navegadores es «el de verdad», y desde el servidor
   * eso no se sabe.
   *
   * `increment` lo resuelve la base en la misma sentencia. Leer el número y
   * escribir el siguiente desde aquí abriría una carrera: dos peticiones a la
   * vez leerían el mismo valor y una de las dos subidas se perdería.
   */
  async closeAllSessions(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  private async openSession(user: AuthenticatedUser, tokenVersion: number): Promise<Session> {
    return {
      user,
      token: await this.tokens.issue(user, tokenVersion),
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
