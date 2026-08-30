/**
 * Borradores que sobreviven a salir de la página y volver.
 *
 * Existen por una promesa que la aplicación ya hace por escrito: cuando la
 * sesión caduca a mitad de una transferencia, la pantalla dice «vuelve a entrar
 * y sigues donde estabas». Sin esto, vuelves a un formulario vacío.
 *
 * Viven en `sessionStorage` y no en `localStorage`: se van al cerrar la
 * pestaña. Un importe a medio escribir no tiene por qué quedarse en el disco de
 * nadie más tiempo del que dura la visita.
 *
 * Todo va envuelto en `try`. En navegación privada, o con el almacenamiento del
 * sitio bloqueado, hasta **leer** `sessionStorage` lanza — y perder el borrador
 * es un contratiempo, no un motivo para dejar la pantalla en blanco. Por lo
 * mismo funciona en el servidor, donde la variable ni siquiera existe.
 */

export function readDraft<T>(key: string): Partial<T> | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);

    // Lo de ahí dentro lo escribimos nosotros, pero cualquiera puede editarlo
    // desde las herramientas del navegador. Comprobar que es un objeto es lo
    // mínimo antes de repartirlo por los campos de un formulario — y un array
    // también es un objeto, así que se descarta aparte.
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

    return parsed;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, value: object): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin sitio, sin permiso o sin `sessionStorage`. El formulario sigue
    // funcionando igual; lo único que se pierde es la red de seguridad.
  }
}

export function clearDraft(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Igual que arriba: no hay nada que rescatar y nada que romper.
  }
}
