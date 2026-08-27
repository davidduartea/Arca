/**
 * El resultado de mover dinero.
 *
 * Los fondos insuficientes no son un error genérico: llevan cuánto había y
 * cuánto se pedía, porque un «no se pudo» a secas obliga a ir a mirar el saldo
 * a otra pantalla.
 */
export interface MoveState {
  error?: string;
  shortfall?: { available: string; requested: string; missing: string };
  done?: { amount: string; description: string };
}

/**
 * El estado inicial.
 *
 * Vive aquí y no junto a las acciones por un motivo de Next: un archivo con
 * `"use server"` **sólo puede exportar funciones asíncronas**. Los tipos se
 * borran al compilar y pasan, pero una constante no — y el fallo no aparece al
 * construir, sino al evaluar el módulo.
 */
export const EMPTY_MOVE: MoveState = {};
