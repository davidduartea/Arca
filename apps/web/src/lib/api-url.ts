/**
 * Dónde vive la API.
 *
 * **Sin prefijo `NEXT_PUBLIC`, y es la decisión de seguridad de todo el
 * frontal.** Una variable con ese prefijo se incrusta en el paquete que se
 * descarga el navegador, y con ella el origen del backend queda publicado para
 * quien mire el código fuente. Al no llevarlo, sólo existe en el servidor: el
 * navegador únicamente ve rutas de este mismo dominio y nunca sabe contra qué
 * habla la aplicación.
 *
 * Se lee al arrancar y no en cada petición: si falta, mejor no levantar.
 */
function requireApiUrl(): string {
  const url = process.env["API_URL"];

  if (!url) {
    throw new Error(
      "Falta API_URL. Es la dirección del backend, y va sin NEXT_PUBLIC para que no acabe en el navegador.",
    );
  }

  return url.replace(/\/+$/, "");
}

export const API_URL = requireApiUrl();
