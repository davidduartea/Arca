/**
 * Lo que comparten transferir e ingresar.
 *
 * Las dos son la misma columna estrecha con un titular arriba: mover dinero
 * pide un formulario corto y nada alrededor que distraiga de la cifra.
 */

/** 420 px. Cabe un campo cómodo y no cabe una segunda columna que tiente. */
export const movePageClass = "max-w-[420px]";

export const moveHeadingClass = "mb-s2 text-[27px]";

/** Los campos apilados, separados por s3. */
export const moveFormClass = "flex flex-col gap-s3";

/** La fila de botones del pie: el principal se estira, el de escape no. */
export const moveActionsClass = "mt-s2 flex gap-s2";

/** La letra pequeña del pie, la que explica lo que no se ve. */
export const moveNoteClass = "text-[11.5px] leading-[1.5] text-ink-3";

/** El acuse: el cuño, el importe y dos salidas. */
export const doneClass = "text-center";
export const doneAmountClass = "mt-s1 font-mono text-[13px] text-ink-2 tabular-nums";
export const doneActionsClass = "mt-s4 flex justify-center gap-s2";
