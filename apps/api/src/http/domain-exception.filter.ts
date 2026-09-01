import { Catch, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";

import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  NotYourAccountError,
  SamePasswordError,
  WrongPasswordError,
} from "../auth/auth.errors";
import {
  AlreadyReversedError,
  IdempotencyKeyReusedError,
  InsufficientEntriesError,
  LedgerInvariantViolatedError,
  TransactionNotFoundError,
  UnbalancedTransactionError,
  UnknownAccountError,
  ZeroAmountError,
} from "../ledger/ledger.errors";
import { InvalidCursorError, InvalidPageSizeError } from "../statements/statements.errors";
import {
  InsufficientFundsError,
  NonPositiveAmountError,
  SameAccountTransferError,
} from "../transfers/transfers.errors";

interface Translation {
  status: HttpStatus;
  /** Si el mensaje del dominio se puede enseñar tal cual. */
  visible: boolean;
}

/**
 * De error de dominio a código de estado.
 *
 * Esto es lo que hace que los servicios no tengan que saber que existe HTTP.
 * `LedgerService` lanza `InsufficientEntriesError` porque eso es lo que ha
 * pasado; que sea un 400 es una traducción, y vive aquí. El mismo motor sirve
 * igual para un cron o un script, donde los códigos de estado no significarían
 * nada.
 *
 * El orden importa: se busca por `instanceof`, así que lo específico va antes.
 */
const TRANSLATIONS: [new (...args: never[]) => Error, Translation][] = [
  // ─── 401 ────────────────────────────────────────────────────────────────
  [InvalidCredentialsError, { status: HttpStatus.UNAUTHORIZED, visible: true }],

  // ─── 403 ────────────────────────────────────────────────────────────────
  // No es 401 a propósito. La sesión vale; lo que no vale es la contraseña
  // que se ha escrito en el cuerpo para autorizar el cambio. Con un 401 el
  // cliente daría la sesión por perdida y echaría a alguien que sólo se ha
  // equivocado tecleando.
  [WrongPasswordError, { status: HttpStatus.FORBIDDEN, visible: true }],

  // ─── 404 ────────────────────────────────────────────────────────────────
  //
  // **Ninguno de los tres dice de qué tipo es**, y ésa es la única forma de
  // que el 404 signifique algo. Son dos ideas —«no existe» y «no es tuyo»— y
  // todo el trabajo de contestar 404 en vez de 403 se pierde si el cuerpo deja
  // distinguirlas: quien va probando identificadores separaría los suyos de
  // los ajenos leyendo el nombre del error, que es exactamente el mapa que el
  // código de estado le estaba negando.
  //
  // Lo que se pierde es un mensaje algo más explicativo cuando de verdad no
  // existe, y no se pierde nada útil: el identificador lo acaba de escribir
  // quien pregunta. La consulta por número de arca, que sí quiere ser amable,
  // lanza su propio `NotFoundException` con el texto bueno y no pasa por aquí.
  [UnknownAccountError, { status: HttpStatus.NOT_FOUND, visible: false }],
  [TransactionNotFoundError, { status: HttpStatus.NOT_FOUND, visible: false }],
  [NotYourAccountError, { status: HttpStatus.NOT_FOUND, visible: false }],

  // ─── 409 ────────────────────────────────────────────────────────────────
  [InsufficientFundsError, { status: HttpStatus.CONFLICT, visible: true }],
  [IdempotencyKeyReusedError, { status: HttpStatus.CONFLICT, visible: true }],
  [AlreadyReversedError, { status: HttpStatus.CONFLICT, visible: true }],
  [EmailAlreadyRegisteredError, { status: HttpStatus.CONFLICT, visible: true }],

  // ─── 400 ────────────────────────────────────────────────────────────────
  [UnbalancedTransactionError, { status: HttpStatus.BAD_REQUEST, visible: true }],
  [InsufficientEntriesError, { status: HttpStatus.BAD_REQUEST, visible: true }],
  [ZeroAmountError, { status: HttpStatus.BAD_REQUEST, visible: true }],
  [NonPositiveAmountError, { status: HttpStatus.BAD_REQUEST, visible: true }],
  [SameAccountTransferError, { status: HttpStatus.BAD_REQUEST, visible: true }],
  [InvalidCursorError, { status: HttpStatus.BAD_REQUEST, visible: true }],
  [InvalidPageSizeError, { status: HttpStatus.BAD_REQUEST, visible: true }],
  [SamePasswordError, { status: HttpStatus.BAD_REQUEST, visible: true }],

  // ─── 500 ────────────────────────────────────────────────────────────────
  // Que la base rechace una escritura significa que algo llegó hasta ella sin
  // pasar por las validaciones: es un fallo nuestro, no de quien llama. Y su
  // mensaje trae dentro nombres de restricciones y de tablas, así que no sale.
  [LedgerInvariantViolatedError, { status: HttpStatus.INTERNAL_SERVER_ERROR, visible: false }],
];

/**
 * Lo que sale cuando el error no es visible. El **nombre también** se sustituye.
 *
 * Ocultar sólo el mensaje no oculta nada: un 404 que responde
 * `{"error":"NotYourAccountError"}` deshace su propio 404. El código dice «aquí
 * no hay nada» y el nombre confirma «existe, y no es tuya», que es exactamente
 * lo que el código de estado estaba escondiendo. Quien fuera probando
 * identificadores distinguiría los suyos de los ajenos leyendo ese campo.
 */
const GENERIC: Partial<Record<HttpStatus, { error: string; message: string }>> = {
  [HttpStatus.NOT_FOUND]: { error: "NotFoundError", message: "No se ha encontrado" },
  [HttpStatus.INTERNAL_SERVER_ERROR]: {
    error: "InternalError",
    message: "Algo ha ido mal por nuestra parte",
  },
};

/** Cuando ni siquiera hay una forma genérica prevista para ese código. */
const UNNAMED = { error: "Error", message: "Error" };

/**
 * El único sitio del que sale una respuesta de error.
 *
 * Captura todo — `@Catch()` sin argumentos — para que nada se escape con la
 * traza puesta. Un stack trace en la respuesta es un mapa del servidor: rutas
 * de archivos, versiones de librerías y a veces trozos de la consulta.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    // Lo que Nest ya sabe contestar — validación, 401 del guardia, 404 de ruta.
    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    const translated = translate(exception);
    if (translated) {
      const { error, status, visible } = translated;

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR)
        this.logger.error(error.message, error.stack);

      response
        .status(status)
        .json(
          visible
            ? { error: error.name, message: error.message }
            : (GENERIC[status] ?? UNNAMED),
        );
      return;
    }

    // Nada de esto estaba previsto: se registra entero y sale un 500 pelado.
    this.logger.error(exception);
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(GENERIC[HttpStatus.INTERNAL_SERVER_ERROR] ?? UNNAMED);
  }
}

function translate(exception: unknown): (Translation & { error: Error }) | null {
  if (!(exception instanceof Error)) return null;

  const found = TRANSLATIONS.find(([type]) => exception instanceof type);

  return found ? { ...found[1], error: exception } : null;
}
