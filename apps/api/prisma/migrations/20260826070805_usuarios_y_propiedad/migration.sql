-- Usuarios, y la propiedad de las cuentas por fin con clave foránea.
--
-- Hasta ahora `accounts.owner_id` era un uuid suelto que no apuntaba a nada.
-- Una cuenta cuyo dueño no existe no es una cuenta, es un agujero.

-- Las cuentas que ya existan no tienen a quién apuntar, así que no pueden
-- satisfacer la clave foránea nueva. Se vacía el libro entero.
--
-- Esto sólo es aceptable porque el esquema no ha estado nunca en producción: lo
-- que haya son datos de desarrollo. Con datos reales, aquí iría un `INSERT` que
-- creara un usuario por cada `owner_id` huérfano.
--
-- Y es `TRUNCATE` y no `DELETE` por un motivo propio de este esquema: los
-- asientos llevan un trigger `BEFORE UPDATE OR DELETE` que rechaza borrarlos.
-- `TRUNCATE` no es ninguna de las dos cosas, así que pasa por encima sin que
-- haya que desactivar la garantía.
TRUNCATE TABLE "entries", "transactions", "accounts" CASCADE;

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El correo se guarda en minúsculas, y lo garantiza la base.
--
-- `Ana@x.com` y `ana@x.com` son la misma persona. Si la normalización viviera
-- sólo en el código, bastaría un `INSERT` desde otro sitio para meter dos
-- usuarios que son el mismo y que el índice único no distinguiría.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_is_lowercase" CHECK (email = lower(email));

-- Un hash vacío sería una puerta abierta si algún día la verificación se
-- descuidara. Que la base no lo admita cierra esa puerta desde abajo.
ALTER TABLE "users"
  ADD CONSTRAINT "users_password_hash_not_empty" CHECK (length(password_hash) > 0);
