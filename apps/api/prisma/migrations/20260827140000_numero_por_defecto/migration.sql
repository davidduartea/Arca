-- Un número por defecto, puesto por la base.
--
-- La migración anterior añadió `number` como NOT NULL y sin valor por defecto.
-- Eso rompe a cualquier instancia que todavía corra la versión anterior del
-- código, porque su `INSERT` no menciona la columna — y en un despliegue
-- progresivo las dos versiones conviven un par de minutos. Cada cuenta abierta
-- en esa ventana falla.
--
-- Con un valor por defecto, la migración deja de ser un cambio que rompe hacia
-- atrás: el código viejo escribe sin número y la base le pone uno válido; el
-- nuevo escribe el suyo y la base lo respeta.
--
-- No sustituye a la generación de la aplicación, que sigue siendo el camino
-- normal. Es el suelo: lo que impide que nadie —ni un script, ni una versión
-- vieja, ni un INSERT a mano— cree una cuenta sin número.

CREATE OR REPLACE FUNCTION arca_new_number() RETURNS CHAR(12)
LANGUAGE plpgsql AS $$
DECLARE
  body TEXT;
  control INT;
BEGIN
  LOOP
    body := '4718' || lpad(floor(random() * 10000000)::TEXT, 7, '0');
    control := arca_check_digit(body);

    -- Cuando el mod 11 pide un «10» no hay cifra que lo represente, así que ese
    -- cuerpo se descarta. Y se comprueba que esté libre: la garantía sigue
    -- siendo el índice único, esto sólo evita el choque casi siempre.
    EXIT WHEN control <> 10
      AND NOT EXISTS (SELECT 1 FROM "accounts" WHERE "number" = body || control);
  END LOOP;

  RETURN body || control;
END;
$$;

ALTER TABLE "accounts" ALTER COLUMN "number" SET DEFAULT arca_new_number();
