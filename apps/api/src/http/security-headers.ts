import type { NextFunction, Request, Response } from "express";

/**
 * Lo que la API dice de sí misma en cada respuesta.
 *
 * Una API que sólo devuelve JSON no necesita casi ninguna política de
 * contenido, y por eso la suya puede ser la más estricta que existe:
 * `default-src 'none'` — no carga nada, de ningún sitio, nunca. Sirve para el
 * caso en que alguien logre que una respuesta se interprete como documento en
 * vez de como datos; a partir de ahí, no hay nada que pueda ejecutar ni a
 * dónde mandarlo.
 *
 * `nosniff` va en la misma dirección y es el que evita el primer paso: sin él,
 * un navegador puede decidir por su cuenta que algo que dijimos que era JSON
 * «parece» HTML y tratarlo como tal.
 *
 * HSTS porque la API viaja con el token de sesión en una cabecera. Sin ella, la
 * primera petición de un cliente que use `http://` viaja en claro y con la
 * sesión dentro. En un origen sin cifrar el navegador ignora esta cabecera, así
 * que en desarrollo no estorba.
 *
 * `no-referrer` y no `same-origin` como en el frontal: las direcciones de la
 * API llevan identificadores de cuentas y de movimientos dentro de la ruta, y
 * no hay ningún caso en que a alguien le haga falta saber de dónde venimos.
 *
 * Se escribe a mano en vez de traer `helmet`: son cinco cabeceras fijas, y la
 * librería añadiría una dependencia y un conjunto de valores por defecto que
 * habría que revisar igual.
 */
export function securityHeaders(_request: Request, response: Response, next: NextFunction) {
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");

  next();
}
