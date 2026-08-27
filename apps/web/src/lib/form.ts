/**
 * Leer un campo de texto de un formulario.
 *
 * `FormData.get()` devuelve `string | File | null`, y pasar eso por `String()`
 * convertiría un archivo en `"[object File]"` — que luego viajaría a la API
 * como si fuera lo que alguien escribió. Aquí lo que no es texto no es texto.
 */
export function text(form: FormData, name: string): string {
  const value = form.get(name);

  return typeof value === "string" ? value : "";
}
