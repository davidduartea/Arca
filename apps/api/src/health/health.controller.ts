import { Controller, Get, Logger, ServiceUnavailableException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { Public } from "../auth/public.decorator";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Las dos preguntas que hace un orquestador, que no son la misma.
 *
 * **`/healthz` — ¿sigue vivo el proceso?** No toca la base a propósito. Es el
 * que mira Render cada pocos segundos, y con la base dentro un hipo de Postgres
 * reiniciaría el contenedor: justo cuando la base vuelve, la API acaba de
 * perder el arranque. Un reinicio no arregla una base caída; sólo alarga el
 * corte.
 *
 * **`/readyz` — ¿puede atender de verdad?** Ése sí consulta. Sirve para dos
 * cosas: saber si el problema es la base o somos nosotros, y mantener despierta
 * a la base del plan gratuito, que se pausa por inactividad y no vuelve sola.
 * Con `/healthz` no bastaría — no la toca, que es su gracia.
 *
 * Los dos son públicos: quien comprueba la salud no tiene sesión. Y lo que
 * enseñan es deliberadamente escaso — ni versión, ni tiempo encendido, ni el
 * error de la base. Un panel de salud es lo primero que mira quien busca por
 * dónde entrar, y el nombre de una versión le dice contra qué CVE probar.
 */
@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sin límite de peticiones, y hace falta.
   *
   * Render comprueba esto cada pocos segundos desde una IP fija, y sin sesión
   * el limitador cuenta por dirección: el propio comprobador acabaría gastando
   * el cupo y leyendo 429, que para él significa «no está sano». El servicio
   * se reiniciaría en bucle por culpa de su propia vigilancia.
   */
  @Public()
  @SkipThrottle()
  @Get("healthz")
  live(): { status: string } {
    return { status: "ok" };
  }

  @Public()
  @SkipThrottle()
  @Get("readyz")
  async ready(): Promise<{ status: string }> {
    try {
      // La consulta más barata que existe y que aun así cruza el pool, la red y
      // el pooler. `SELECT 1` no lee ninguna tabla: comprueba el camino, no los
      // datos, que es lo que se está preguntando.
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      // El motivo se registra y no se responde: el error de conexión trae
      // dentro el host, el puerto y a veces el usuario de la base.
      this.logger.error("La base no responde", error);

      throw new ServiceUnavailableException({
        error: "DatabaseUnreachableError",
        message: "El libro no está disponible ahora mismo",
      });
    }

    return { status: "ok" };
  }
}
