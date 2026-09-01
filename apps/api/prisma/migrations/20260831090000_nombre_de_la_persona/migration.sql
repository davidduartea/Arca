-- El nombre de quien tiene la cuenta.
--
-- Hasta ahora de una persona sólo se sabía el correo, y eso rompía la pantalla
-- que más importa: al teclear un número de arca se enseñaba **el nombre de la
-- cuenta de destino** para confirmar. O sea que cualquiera con doce cifras leía
-- la etiqueta privada que su dueño le puso — «Ahorro para el divorcio» — y
-- además no confirmaba nada útil, porque lo que quiere saber quien va a mandar
-- dinero es a *quién* se lo manda, no cómo llamó esa persona a su cajón.
--
-- Con esta columna, la consulta pasa a devolver el nombre de la persona y la
-- etiqueta de la cuenta deja de salir del servidor.

ALTER TABLE "users" ADD COLUMN "name" TEXT;

-- Lo que hay para las que ya existen: la parte del correo anterior a la arroba.
--
-- No es un nombre y no se pretende que lo sea. Es lo único que esa persona
-- escribió alguna vez, y se prefiere a inventar un «Usuario 47» o a dejar la
-- columna vacía y tener que decidir en cada pantalla qué se enseña cuando falta.
-- Por eso el mismo cambio trae la forma de corregirlo desde «Tu cuenta»: un
-- nombre puesto por la máquina que no se puede cambiar sería peor que no tenerlo.
UPDATE "users" SET "name" = split_part("email", '@', 1) WHERE "name" IS NULL;

ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;

-- Ni vacío ni sólo espacios: es lo que ve un desconocido antes de mandar dinero,
-- y un nombre en blanco convierte esa confirmación en un hueco. La aplicación ya
-- lo recorta y lo exige, y esto es lo mismo escrito donde no se puede saltar.
ALTER TABLE "users"
  ADD CONSTRAINT "users_name_not_blank" CHECK (btrim("name") <> '');
