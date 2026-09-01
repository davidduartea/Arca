-- Dos autoridades sobre el mismo libro.
--
-- Hasta aquí la aplicación entraba como superusuario, que es decir que no había
-- ninguna frontera: un fallo en una consulta de lectura podía devolver el
-- extracto de otra persona, y una inyección podía reescribir un asiento o tirar
-- el trigger que garantiza que los asientos suman cero.
--
-- ## Por qué DOS roles y no uno con RLS
--
-- La respuesta corta: en un libro por partida doble, mover dinero **tiene** que
-- tocar la cuenta de otro. Una transferencia bloquea las dos cuentas y le
-- escribe un asiento a la del destinatario.
--
-- Una política por dueño sobre ese camino no protege: rompe. Y rompe callando,
-- que es lo peor que puede hacer. Comprobado contra Postgres:
--
--   · `SELECT ... WHERE id IN (mia, suya) FOR UPDATE` devuelve UNA fila. No da
--     error. `lockAccounts` creería que tiene las dos cuentas bloqueadas y la
--     garantía de concurrencia sobre la cuenta destino habría desaparecido.
--   · La comprobación de fondos de una anulación suma los asientos de la cuenta
--     que cobró — la del otro — y con la política puesta lee 0 en vez de 9500.
--     Sin error. Rechazaría una devolución legítima, o algo peor.
--
-- Así que la frontera no va por filas, va por **autoridad**, que es lo que de
-- verdad se está separando:
--
--   `arca_reader`  Sólo lee, y sólo lo tuyo. Lo obliga la base, no el código.
--                  Es quien sirve el extracto, el saldo y la lista de cuentas —
--                  justo donde vive el fallo de «se me olvidó filtrar por
--                  dueño», que es el que filtra dinero ajeno.
--
--   `arca_ledger`  El camino del dinero, el acceso y la auditoría. Ve todo el
--                  libro porque le hace falta, pero **no puede modificar ni
--                  borrar un asiento**, ni tocar los triggers, ni vaciar una
--                  tabla. Su límite son los privilegios, no las políticas.
--
-- Ninguno de los dos es dueño de las tablas, y ahí está la otra mitad: quien no
-- es dueño no puede `DROP TRIGGER`, ni `ALTER TABLE ... DISABLE ROW LEVEL
-- SECURITY`, ni `TRUNCATE`. Las migraciones las sigue aplicando el dueño, que
-- es otra conexión y otro momento.

-- ─── Los roles ───────────────────────────────────────────────────────────────
--
-- Sin contraseña y sin poder entrar: son roles de grupo, y llevan los permisos.
-- Quien se conecta es un usuario de cada entorno al que se le concede uno de
-- los dos. Así la credencial vive donde tiene que vivir —en el entorno— y no
-- dentro de un archivo versionado.
--
-- IMPORTANTE: un usuario que fuera miembro de LOS DOS tendría las políticas de
-- los dos, y las permisivas se suman: la del libro dice «todo» y anularía a la
-- del lector. Cada usuario, un rol y sólo uno.
--
-- El `DO` es porque los roles son del cluster entero y no de esta base, así que
-- esta migración se encuentra los suyos ya creados al correr sobre la segunda
-- base del mismo Postgres — la de pruebas, sin ir más lejos. Postgres no tiene
-- `CREATE ROLE IF NOT EXISTS`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arca_reader') THEN
    CREATE ROLE arca_reader NOLOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arca_ledger') THEN
    CREATE ROLE arca_ledger NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO arca_reader, arca_ledger;

-- ─── Quién es quien pregunta ─────────────────────────────────────────────────
--
-- La aplicación lo anuncia con `set_config('arca.user_id', ..., true)` dentro
-- de la transacción, y las políticas lo leen de aquí.
--
-- El `true` de `current_setting` es «no revientes si no está puesta», y el
-- `nullif` convierte la cadena vacía en nulo. Los dos empujan al mismo sitio:
-- **sin identidad, NULL**. Y `owner_id = NULL` no es cierto para ninguna fila,
-- así que una consulta que se olvide de decir quién pregunta no ve nada, en vez
-- de verlo todo. La forma de fallar importa más que el caso normal.
CREATE FUNCTION arca_current_user() RETURNS uuid
  LANGUAGE sql
  STABLE
  -- Sin acceso a tablas, así que no hace falta abrirle el `search_path` a nada.
  -- Fijarlo evita que alguien que pueda crear objetos en un esquema por delante
  -- cambie qué significa `nullif` o `current_setting` dentro de esta función.
  SET search_path = pg_catalog
  AS $$
    SELECT nullif(current_setting('arca.user_id', true), '')::uuid
  $$;

-- ─── El lector: mira y no toca ───────────────────────────────────────────────
--
-- `SELECT` y nada más. Ni INSERT, ni UPDATE, ni DELETE sobre ninguna tabla: si
-- el camino de lectura intentara escribir, el error sale de Postgres y no de una
-- revisión de código.
GRANT SELECT ON "users", "accounts", "transactions", "entries" TO arca_reader;

-- ─── El libro: escribe, pero no reescribe ────────────────────────────────────
--
-- **Sobre `entries` y `transactions` no hay UPDATE ni DELETE, y es lo más
-- importante de este archivo.** Un asiento se escribe una vez y no se vuelve a
-- tocar; corregir es anular con otro asiento que invierte los importes. Eso ya
-- lo sujetaba un trigger, pero un trigger lo puede quitar quien sea dueño de la
-- tabla — y hasta hoy la aplicación lo era. Ahora ni el trigger ni el privilegio
-- están a su alcance: ni una inyección de SQL con la conexión de la aplicación
-- podría cambiar un importe ya escrito.
GRANT SELECT, INSERT ON "transactions", "entries" TO arca_ledger;

-- Las cuentas sí cambian, pero sólo en dos columnas. El UPDATE se concede
-- columna a columna en vez de sobre la tabla: así `owner_id` es intocable —
-- cambiarlo sería quedarse con la cuenta de otro y todo su saldo— y `number` y
-- `kind` tampoco se pueden mover.
--
-- `closed_at` va aquí y no es evidente: cerrar una cuenta es una escritura, y
-- el camino que la hace comprueba antes que sea tuya y que esté a cero.
GRANT SELECT, INSERT ON "accounts" TO arca_ledger;
GRANT UPDATE ("name", "closed_at") ON "accounts" TO arca_ledger;

-- Y el UPDATE que hace falta para bloquear.
--
-- `SELECT ... FOR UPDATE` exige el privilegio de UPDATE sobre alguna columna, y
-- las dos de arriba lo dan. Es lo que permite que una transferencia bloquee las
-- dos cuentas sin poder cambiarles el dueño.

GRANT SELECT, INSERT ON "users" TO arca_ledger;
GRANT UPDATE ("name", "password_hash", "token_version") ON "users" TO arca_ledger;

-- `email` no se puede cambiar, y no por olvido: es la identidad con la que se
-- entra. Cambiarlo es un movimiento que necesita confirmar la dirección nueva
-- antes de soltar la vieja, y mientras eso no exista, la base no lo permite.

-- ─── Las políticas ───────────────────────────────────────────────────────────
--
-- Con RLS activada, un rol que no sea dueño de la tabla **no ve nada** hasta que
-- una política se lo permita. Otra vez, cerrado por defecto: añadir una tabla y
-- olvidarse de su política la deja invisible, no abierta.
--
-- Aquí no hace falta `FORCE`: el dueño de las tablas se salta RLS por
-- definición, y el dueño es quien migra, no quien atiende peticiones.

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "entries" ENABLE ROW LEVEL SECURITY;

-- El libro ve el libro entero. Su límite son los privilegios de arriba, no esto:
-- no puede reescribir un asiento por más que la política le deje mirarlo.
CREATE POLICY "libro" ON "users" TO arca_ledger USING (true) WITH CHECK (true);
CREATE POLICY "libro" ON "accounts" TO arca_ledger USING (true) WITH CHECK (true);
CREATE POLICY "libro" ON "transactions" TO arca_ledger USING (true) WITH CHECK (true);
CREATE POLICY "libro" ON "entries" TO arca_ledger USING (true) WITH CHECK (true);

-- Y el lector, sólo lo suyo.

CREATE POLICY "solo_yo" ON "users" FOR SELECT TO arca_reader
  USING ("id" = arca_current_user());

CREATE POLICY "solo_mias" ON "accounts" FOR SELECT TO arca_reader
  USING ("owner_id" = arca_current_user());

-- `entries` y `transactions` no tienen dueño propio, y no deberían tenerlo: un
-- `owner_id` en el asiento sería el mismo dato en dos sitios, y el día que no
-- coincidiera con el de su cuenta habría que decidir cuál miente. Así que la
-- pertenencia se pregunta por donde de verdad vive, que es la cuenta.
--
-- El `EXISTS` sobre `accounts` pasa a su vez por la política de `accounts`, que
-- para este rol ya sólo enseña las suyas. La condición queda dicha dos veces y
-- las dos dicen lo mismo, así que no hay hueco entre ellas.
CREATE POLICY "solo_mios" ON "entries" FOR SELECT TO arca_reader
  USING (
    EXISTS (
      SELECT 1 FROM "accounts" a
       WHERE a."id" = "entries"."account_id"
         AND a."owner_id" = arca_current_user()
    )
  );

-- Una transacción se ve si alguno de sus asientos toca una cuenta tuya. En una
-- transferencia eso es cierto para las dos partes, y es lo correcto: el
-- movimiento aparece en los dos extractos porque les pasó a los dos.
--
-- Lo que la transacción NO enseña es en qué cuenta ajena cayó el dinero: eso son
-- asientos, y los asientos ajenos los tapa la política de arriba.
CREATE POLICY "solo_mias" ON "transactions" FOR SELECT TO arca_reader
  USING (
    EXISTS (
      SELECT 1
        FROM "entries" e
        JOIN "accounts" a ON a."id" = e."account_id"
       WHERE e."transaction_id" = "transactions"."id"
         AND a."owner_id" = arca_current_user()
    )
  );
