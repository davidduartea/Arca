/**
 * Las fechas del extracto, con el mismo formato en toda la pantalla.
 *
 * Viven aquí y no en cada componente porque la lista y la consulta por fecha
 * escriben días en la misma columna visual: si una pusiera «15 ago 2026» y la
 * otra «15/08/2026», la respuesta parecería venir de otro sitio.
 *
 * No están en `lib` a propósito. Lo que sale de `Intl` depende de la versión de
 * los datos de idioma del sistema, así que un test sobre la cadena exacta se
 * rompería solo el día que Node actualice sus tablas — y comprobarlo llamando a
 * `Intl` desde el test no comprueba nada.
 */

const DAY = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const CLOCK = new Intl.DateTimeFormat("es", {
  hour: "2-digit",
  minute: "2-digit",
});

/** «29 ago 2026». */
export function formatDay(iso: string): string {
  return DAY.format(new Date(iso));
}

/**
 * «29 ago 2026 · 18:44».
 *
 * El día y la hora se piden por separado y se juntan a mano para poner el punto
 * medio en vez de la coma que trae el formato largo. La coma es el separador de
 * dentro de la fecha —«29 ago 2026, 18:44» se lee como una sola cosa larga— y
 * el punto medio separa dos datos, que es lo que son. Es además el signo con el
 * que se separan las cosas en el resto de la aplicación.
 */
export function formatMoment(iso: string): string {
  const moment = new Date(iso);

  return `${DAY.format(moment)} · ${CLOCK.format(moment)}`;
}
