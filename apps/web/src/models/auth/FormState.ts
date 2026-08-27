/**
 * Lo que un formulario devuelve al re-renderizarse.
 *
 * `issues` viene del validador y va por campo; `error` es el mensaje general.
 * En el acceso sólo se usa `error`, y a propósito: marcar el campo del correo
 * diría si ese correo existe.
 */
export interface FormState {
  error?: string;
  issues?: Record<string, string>;
  /** Salió bien. Lo usan los formularios que se vacían después de enviarse. */
  ok?: boolean;
}

/**
 * El estado inicial.
 *
 * Vive aquí y no junto a las acciones por un motivo de Next: un archivo con
 * `"use server"` **sólo puede exportar funciones asíncronas**. Los tipos se
 * borran al compilar y pasan, pero una constante no — y el fallo no aparece al
 * construir, sino al evaluar el módulo.
 */
export const EMPTY_FORM: FormState = {};
