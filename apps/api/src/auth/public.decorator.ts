import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC = "arca:public";

/**
 * Abre un endpoint a quien no ha iniciado sesión.
 *
 * El guardia es **global**: todo está cerrado salvo lo que se marque aquí. Al
 * revés — proteger endpoint por endpoint — el día que alguien añade uno nuevo y
 * se olvida del decorador, queda abierto y nadie se entera hasta que es tarde.
 * Con este orden, olvidarse cierra en vez de abrir.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
