-- El número de arca: lo único de una cuenta que una persona ve, dicta o teclea.
--
-- Doce cifras — cuatro de emisión, siete de cuenta y una de control. El uuid
-- sigue siendo la clave interna; deja de ser algo que nadie tenga que copiar,
-- porque un uuid no se puede dictar por teléfono.

-- El dígito de control, en la base y no sólo en el código.
--
-- Es la misma decisión que el trigger de la partida doble: si la regla vive
-- únicamente en la aplicación, un INSERT desde un script o desde la consola
-- mete un número que nadie podrá teclear nunca — y no se descubre hasta que
-- alguien intenta usarlo.
--
-- Mod 11 con pesos de derecha a izquierda. Detecta cualquier cifra cambiada y,
-- lo que de verdad importa, también las transposiciones: teclear 2039 donde
-- ponía 2093 es el error de copia más común, y un mod 10 a secas no lo vería.
CREATE OR REPLACE FUNCTION arca_check_digit(body TEXT) RETURNS INT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  weights INT[] := ARRAY[2, 3, 4, 5, 6, 7, 2, 3, 4, 5, 6];
  total INT := 0;
  i INT;
BEGIN
  IF body !~ '^[0-9]{11}$' THEN
    RETURN -1;
  END IF;

  FOR i IN 1..11 LOOP
    total := total + substr(body, 12 - i, 1)::INT * weights[i];
  END LOOP;

  RETURN (11 - (total % 11)) % 11;
END;
$$;

ALTER TABLE "accounts" ADD COLUMN "number" CHAR(12);

-- Las cuentas que ya existen necesitan el suyo.
--
-- Se sortea hasta dar con uno válido y libre. Cuando el mod 11 pide un «10» no
-- hay cifra que lo represente, así que ese cuerpo se descarta: pasa una vez de
-- cada once.
DO $$
DECLARE
  account RECORD;
  body TEXT;
  control INT;
BEGIN
  FOR account IN SELECT id FROM "accounts" WHERE "number" IS NULL LOOP
    LOOP
      body := '4718' || lpad(floor(random() * 10000000)::TEXT, 7, '0');
      control := arca_check_digit(body);

      EXIT WHEN control <> 10
        AND NOT EXISTS (SELECT 1 FROM "accounts" WHERE "number" = body || control);
    END LOOP;

    UPDATE "accounts" SET "number" = body || control WHERE id = account.id;
  END LOOP;
END;
$$;

ALTER TABLE "accounts" ALTER COLUMN "number" SET NOT NULL;

CREATE UNIQUE INDEX "accounts_number_key" ON "accounts"("number");

-- Y la regla queda escrita donde no se puede saltar.
ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_number_is_valid"
  CHECK (
    "number" ~ '^[0-9]{12}$'
    AND arca_check_digit(substr("number", 1, 11)) = substr("number", 12, 1)::INT
  );
