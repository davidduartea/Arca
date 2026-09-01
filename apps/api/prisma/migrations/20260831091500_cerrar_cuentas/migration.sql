-- Cerrar una cuenta sin borrarla.
--
-- Borrar no es una opción, y no por prudencia: los asientos apuntan a la cuenta
-- y son inmutables — hay un trigger que impide tocarlos—, así que borrar la fila
-- dejaría un extracto hablando de algo que no existe, o una clave foránea rota.
--
-- Así que se marca. Una cuenta cerrada deja de poder mandar y de poder recibir,
-- y su extracto se sigue leyendo entero, que es de lo que trata un libro
-- contable. Y se puede reabrir: aquí no hay administrador a quien escribirle, y
-- un cierre irreversible convertiría un clic de más en una cuenta perdida para
-- siempre, con su número — que es lo que su dueño ya repartió a otros.
--
-- Una fecha y no un booleano. Cuesta lo mismo y contesta además «cuándo», que es
-- la primera pregunta que se hace quien mira una cuenta cerrada.

ALTER TABLE "accounts" ADD COLUMN "closed_at" TIMESTAMP(3);

-- Las de sistema no se cierran nunca: el mundo exterior no cierra.
--
-- Escrito aquí y no sólo en el código porque es una regla del libro, no de una
-- pantalla: cerrar la cuenta de la que sale todo ingreso dejaría la aplicación
-- sin poder meter dinero, y el fallo aparecería lejos de la causa.
ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_system_never_closes"
  CHECK ("kind" <> 'SYSTEM' OR "closed_at" IS NULL);
