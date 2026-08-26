-- La cuenta del mundo exterior.
--
-- Un ingreso tiene que salir de algún sitio o la transacción no sumaría cero.
-- Sale de aquí: es el contrapunto contable de «esto entró desde fuera del
-- banco». Su saldo es negativo por definición y se hace más negativo con cada
-- ingreso — eso no es un descubierto, es la medida de cuánto dinero ha entrado
-- al libro.
--
-- Va en una migración, con identificador fijo, y no en un servicio que la cree
-- al vuelo, por dos motivos: el código necesita conocer su identificador, y
-- crearla bajo demanda desde dos peticiones a la vez produciría dos mundos
-- exteriores y un libro que ya no cuadra consigo mismo.

-- Toda cuenta necesita dueño desde que `owner_id` tiene clave foránea. Éste no
-- es una persona y no puede iniciar sesión: `sin-acceso` cumple el CHECK de
-- hash no vacío, pero no tiene la forma que `verifyPassword` exige, así que
-- ninguna contraseña puede coincidir con él.
INSERT INTO "users" ("id", "email", "password_hash")
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'sistema@arca.local',
  'sin-acceso'
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "accounts" ("id", "owner_id", "name", "kind")
VALUES (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  'Mundo exterior',
  'SYSTEM'
)
ON CONFLICT ("id") DO NOTHING;
