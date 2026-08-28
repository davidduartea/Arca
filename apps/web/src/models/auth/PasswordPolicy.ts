/**
 * Cuánto tiene que medir una contraseña.
 *
 * Doce caracteres y ninguna regla más: ni mayúsculas, ni símbolos, ni números
 * obligatorios. Esas reglas producen «Password1!» una y otra vez, y es la
 * longitud lo que de verdad protege.
 *
 * Vive en un archivo propio, sin esquemas ni zod, porque lo lee también el
 * formulario del navegador —para el contador que cuenta hacia arriba— y traerse
 * el validador entero hasta el cliente para consultar un número sería pagar
 * unos cuantos kilobytes por una constante.
 */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * La misma política, dicha para quien la va a cumplir.
 *
 * Se escribe una vez porque se lee en dos sitios —al registrarse y al
 * cambiarla— y son la misma regla. El ejemplo no sobra: sin él, «sin símbolos
 * obligatorios» se entiende como un permiso y no como lo que es, una invitación
 * a escribir algo largo que se recuerde.
 */
export const PASSWORD_EXPLANATION =
  "Doce caracteres o más. Sin mayúsculas ni símbolos obligatorios — «caballo verde en la cocina» vale.";
