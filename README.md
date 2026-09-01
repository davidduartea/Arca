# Arca

Un libro contable por partida doble, con una idea en el centro:

> **El saldo no se guarda en ninguna parte.** Se deriva sumando los asientos.

Un campo `balance` es un dato duplicado, y un dato duplicado acaba
desincronizado. Con dinero, eso significa que el banco y el cliente dejan de
estar de acuerdo en cuánto hay.

---

## La invariante

Cada transacción son **dos o más asientos que suman cero**. Una transferencia de
$50 no es «restar aquí, sumar allá»: es una transacción con dos líneas que se
guardan juntas o no se guarda ninguna.

```
transacción «transferencia de $50»
  ├─ cuenta origen    −5000
  └─ cuenta destino   +5000
                      ─────
                          0
```

Y eso **lo garantiza Postgres**, no la aplicación:

```sql
CREATE CONSTRAINT TRIGGER entries_must_balance
  AFTER INSERT ON entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_transaction_balances();
```

`DEFERRABLE INITIALLY DEFERRED` es lo que hace que funcione: la comprobación se
aplaza hasta el `COMMIT`. Sin eso fallaría siempre — al insertar el primer
asiento la suma es −5000, no cero, porque el segundo aún no existe.

Una comprobación en el código protege el camino que uno recuerda proteger. Una
restricción aquí protege también de la consulta manual a las tres de la mañana,
del script de importación y de la migración mal escrita.

---

## Las otras decisiones

**El dinero es un entero.** `$10.50` se guarda como `1050` centavos. Nunca un
decimal: `0.1 + 0.2` no es `0.3` en coma flotante, y esa diferencia se acumula
hasta que los libros dejan de cuadrar.

**Una sola moneda: dólares.** No hay columna de divisa, y es deliberado —
mezclar monedas dentro de una transacción rompería la suma a cero, porque
sumar dólares con euros no da un número con significado. Un libro multidivisa
se hace con un libro por moneda y una transacción de cambio que los cruza.

**Los asientos son inmutables.** No hay `UPDATE` ni `DELETE` — hay un trigger
que los rechaza. Un error se corrige con una transacción que invierte los
importes, de modo que el histórico cuenta lo que pasó de verdad, incluido el
error. Que es justo lo que se le pide a un libro contable.

**Idempotencia en la escritura.** El cliente manda una clave; si reintenta
porque se le cayó la red, no se cobra dos veces.

---

## Estado

**Fase 0 · esquema e invariante** — hecho
**Fase 1 · motor de asientos** — hecho
**Fase 2 · transferencias y concurrencia** — hecho
**Fase 3 · extracto y saldo a fecha** — hecho
**Fase 4 · API HTTP** — hecho
**Fase 5 · auditoría del libro** — hecho
**Fase 6 · la cara** — hecho

422 tests: 254 de la API y 168 del frontal. Los de integración van contra
Postgres de verdad y no contra dobles. No es purismo: buena parte de lo que hay
que probar **es** la base, y un doble no tiene triggers. Un test que pasara con
un doble no diría nada sobre si el libro cuadra.

El motor registra movimientos, deriva saldos e invierte transacciones para
corregir errores. No guarda saldos y no decide si un movimiento está permitido:
eso es una política, y vive en `TransfersService`, que la aplica con la cuenta
bloqueada. `StatementsService` sólo lee. Y por encima, una API que traduce todo
eso a HTTP sin que ninguno de ellos sepa que HTTP existe. Y al margen de todo,
un comando que audita el libro entero y no se fía de nada de lo anterior.

| Método | Ruta                            | Qué                         |
| ------ | ------------------------------- | --------------------------- |
| POST   | `/auth/register` · `/login`     | abiertas                    |
| GET    | `/auth/me`                      | quién soy                   |
| PATCH  | `/auth/name` · `/auth/password` | cambiar lo mío              |
| POST   | `/auth/logout-all`              | echar a todas mis sesiones  |
| GET    | `/accounts`                     | mis cuentas con saldo       |
| POST   | `/accounts`                     | abrir una                   |
| GET    | `/accounts/:id`                 | una, con saldo              |
| PATCH  | `/accounts/:id`                 | renombrarla                 |
| POST   | `/accounts/:id/closure`         | cerrarla — exige saldo cero |
| DELETE | `/accounts/:id/closure`         | reabrirla                   |
| GET    | `/accounts/lookup?number=`      | de quién es un número       |
| GET    | `/accounts/:id/statement`       | extracto paginado           |
| GET    | `/accounts/:id/balance?at=`     | saldo a una fecha           |
| POST   | `/transfers`                    | mover dinero                |
| POST   | `/deposits`                     | simular un ingreso externo  |
| POST   | `/transactions/:id/reversal`    | devolver — sólo quien cobró |
| GET    | `/healthz` · `/readyz`          | salud: proceso · y base     |

El frontal es Next.js y **ni una petición sale del navegador hacia la API**:
todo pasa por acciones de servidor. El token vive en una cookie que el
JavaScript no puede leer, y el origen del backend no aparece en el paquete que
se descarga nadie. Lo único que ve el cliente son rutas de su propio dominio.

### Lo que costó averiguar

La restricción diferida salta en el `COMMIT`, y ahí Prisma **pierde el motivo**:
Postgres cierra la transacción al rechazar el commit, Prisma intenta un
`ROLLBACK` sobre algo ya cerrado y reporta ese fallo secundario — «Transaction
already closed» — en lugar de la violación. El rechazo llega, la razón no.

La escritura del motor cierra esa ventana ella misma, al final de su unidad de
trabajo:

```ts
await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
```

La restricción sigue siendo diferida, que es lo que permite insertar los
asientos de uno en uno. Lo único que cambia es que la comprobación pasa a ser un
error de sentencia normal, con su SQLSTATE y con el mensaje del trigger entero.

### El test que define el proyecto

> Una cuenta con $100. Cincuenta transferencias de $10 **en paralelo**.
> Exactamente diez tienen éxito, cuarenta fallan, el saldo queda en cero y
> nunca en negativo.

Pasa. Y para asegurarme de que pasa por el motivo correcto, lo corrí quitando el
bloqueo: **salen quince** en vez de diez, y la cuenta acaba en -$50.

Que no salgan las cincuenta es lo interesante. El pool de conexiones serializa
parte de la carrera por accidente, así que una implementación ingenua parece
correcta mientras se prueba a mano y falla en producción, con volumen, sin dejar
un error que apunte a la causa.

Lo que lo arregla es coger la fila de la cuenta antes de leer el saldo:

```sql
SELECT id FROM accounts WHERE id = $1 FOR UPDATE
```

La fila no guarda ningún saldo. Se bloquea **por su identidad**, como quien coge
una llave: quien la tiene lee y escribe sin que nadie se cuele, y los demás
esperan y vuelven a leer ya con lo que escribió el anterior. El bloqueo y la
escritura van en la misma transacción — si fueran dos, se soltaría antes de
escribir y no serviría de nada.

Y las llaves se cogen **siempre en el mismo orden**, ordenadas por id. Sin eso,
una transferencia A→B y otra B→A a la vez se quedan esperándose: cada una tiene
la que la otra necesita. Postgres detecta el interbloqueo y mata a una, así que
el síntoma no sería un cuelgue sino un fallo intermitente e inexplicable.

### El movimiento que desaparece

El extracto pagina por cursor y no por `OFFSET`, y no es por rendimiento.

`LIMIT 20 OFFSET 40` se mide sobre un resultado que se mueve. Si entre la página
1 y la 2 llega un movimiento nuevo, todo se desplaza una posición: el último de
la página 1 vuelve a salir el primero en la 2. En una lista de artículos es un
incordio; en un extracto bancario es un movimiento duplicado ante los ojos de
quien lo lee. Y al revés, algo puede **desaparecer** sin que nadie se entere.

El cursor apunta a una fila concreta, y lleva **dos** campos:

```
(created_at, id)
```

La fecha sola no basta, y aquí está garantizado que no basta: en Postgres
`now()` devuelve la hora de inicio de la transacción, no la de cada fila, así
que todos los asientos de un mismo movimiento comparten `created_at` al
milisegundo. `created_at` es `TIMESTAMP(3)` — la misma precisión que `Date` en
JavaScript — de modo que el empate llega intacto hasta el cliente.

Como en la fase 2, lo comprobé al revés. Con un cursor de sólo fecha, un
movimiento de dos partidas sobre la misma cuenta se lee así:

|                      | asientos que devuelve el extracto |
| -------------------- | --------------------------------- |
| cursor `(fecha, id)` | **2** ✓                           |
| cursor sólo `fecha`  | 1 — uno desaparece                |

### La frontera HTTP

Dos decisiones al salir al cable.

**Los importes viajan como texto.** Un número en JSON es un `double` de IEEE
754, así que por encima de 2^53 centavos `JSON.parse` redondea en silencio: el
mismo problema de precisión que el proyecto evita guardando enteros volvería a
entrar por la puerta de la API. Un importe que llegue como número JSON se
**rechaza** en lugar de aceptarse por amabilidad.

```json
{ "balance": "9007199254740993" }
```

`JSON.stringify` tampoco sabe serializar un `bigint` — lanza. Hay quien lo
arregla parcheando `BigInt.prototype.toJSON`, y eso convierte la decisión en un
accidente global que no se ve al leer el código. Aquí la conversión vive en un
solo archivo, `http/views.ts`, precisamente para que se pueda comprobar de un
vistazo que no queda ningún `bigint` sin convertir.

**La cuenta de otro responde 404, no 403.** Un 403 confirma que esa cuenta
existe, y quien va probando identificadores no tiene por qué averiguarlo. El
dominio sí distingue «no existe» de «no es tuya», porque para registrar y
depurar son cosas distintas; la traducción a HTTP las colapsa a propósito.

Y esa traducción es la que hace que los servicios sigan sin saber que HTTP
existe: `LedgerService` lanza `InsufficientEntriesError` porque es lo que ha
pasado. Que eso sea un 400 se decide en `http/domain-exception.filter.ts`, y el
mismo motor sirve igual para un cron, donde un código de estado no significaría
nada.

### Dos conexiones, porque son dos autoridades

La aplicación entra a Postgres con **dos usuarios distintos**, y ninguno de los
dos es dueño de las tablas.

`arca_reader` sirve extractos, saldos y la lista de cuentas. Tiene `SELECT` y
nada más, y unas políticas por fila que comparan con el identificador que la
petición anuncia. Una consulta a la que se le olvide filtrar por dueño **no
devuelve el libro entero**: devuelve lo de quien pregunta. Y una que se olvide de
decir quién pregunta no devuelve nada, porque la comparación es contra nulo.

`arca_ledger` mueve el dinero. Ve el libro entero, y hace falta que lo vea: una
transferencia bloquea la cuenta del destinatario y le escribe un asiento, y esa
cuenta es de otro. Lo que no puede es **reescribir ni borrar un asiento**, ni
vaciar una tabla, ni tocar los triggers — no tiene el privilegio y no es dueño de
nada. Ni una inyección de SQL con esa conexión cambiaría un importe ya escrito.

Que sean dos y no uno con RLS es el resultado de comprobarlo, no una preferencia.
Una política por dueño sobre el camino del dinero no protege: **rompe callando**.
El `SELECT ... FOR UPDATE` sobre las dos cuentas de una transferencia devuelve
una sola fila y no da error, así que el bloqueo sobre la cuenta ajena desaparece
sin que nadie se entere; y la comprobación de fondos de una anulación lee cero
donde hay 9.500. En un libro contable, un fallo silencioso en el camino del
dinero es peor que no tener la protección.

Los tests que sujetan todo esto están en `src/prisma/roles.spec.ts`, y están
escritos al revés que los demás: las consultas van **mal a propósito** —sin el
filtro, tocando lo que no toca— y lo que se comprueba es que la base no siga a
la aplicación cuando la aplicación se equivoca.

### Una auditoría que no se fía de nada

Los triggers garantizan que **cada transacción** cuadra. `pnpm ledger:audit`
pregunta si cuadra **el libro entero**, que no es la misma pregunta: un trigger
protege la fila que se está escribiendo y no sabe nada del conjunto.

```
Arca · auditoría del libro
  cuentas        3
  transacciones  1
  asientos       2
  neto           $0.00   ← tiene que ser cero

✗ 1 hallazgo, 1 crítico

  [critical] overdrawn-user-accounts
      · 6418f9b8-… con -5000
```

Ese ejemplo es real, y enseña por qué hacen falta ocho controles y no uno: **el
neto es cero** — el libro cuadra globalmente — y aun así hay una persona en
números rojos.

Tres decisiones:

**Va en SQL a pelo**, sin pasar por Prisma. Una auditoría que se apoya en el
mismo código que audita no audita nada: si hubiera un fallo en cómo el proyecto
lee o escribe asientos, una comprobación hecha con las mismas herramientas lo
heredaría y saldría limpia.

**Comprueba cosas que ya garantiza la base.** Que los asientos sumen cero lo
impone un trigger, así que en teoría sobra. Se comprueba igual: un trigger se
puede caer en una migración mal escrita, o desactivarse para una carga masiva y
no volver a activarse. Hay tests que desactivan el trigger a propósito y
verifican que la auditoría lo ve.

**Es un comando y no un endpoint.** Auditar el libro entero es una operación de
explotación, no algo que pida un cliente: devuelve el estado global del sistema,
que no es asunto de nadie que tenga una cuenta. Como comando encaja en un cron o
en un paso de CI, y el **código de salida** lo hace útil sin leerlo — distinto
de cero, hay que mirar. Un aviso no rompe el comando; sólo lo crítico.

---

## Cómo correrlo

```bash
pnpm install
pnpm db:up          # Postgres en el 5433
pnpm db:migrate
pnpm db:roles       # los dos usuarios con los que corre la aplicación
pnpm test           # crea la base de pruebas y la migra por su cuenta
pnpm ledger:audit   # ¿cuadra el libro entero?
pnpm dev            # la API en el 3000
pnpm dev:web        # la web en el 3001
```

El puerto es el 5433 y no el 5432 para no chocar con otras bases en la misma
máquina.

Los tests usan una base aparte, `arca_test`, y la vacían entre casos. El
arranque de Vitest la crea si no existe y se niega a arrancar si alguien apunta
`TEST_DATABASE_URL` a la de desarrollo.

---

## Despliegue

Tres servicios y ningún euro: la web en **Vercel**, la API en **Render** desde
`apps/api/Dockerfile`, y Postgres en **Supabase**.

```bash
docker build -f apps/api/Dockerfile .   # el contexto es la raíz, no apps/api
```

La imagen aplica sus propias migraciones antes de escuchar. Si una falla, el
contenedor no arranca — es deliberado: una API hablando con un esquema que no le
corresponde falla de formas mucho más difíciles de diagnosticar.

Dos cadenas de conexión y no una, que es la trampa que más cuesta ver: la
aplicación va por el pooler en modo transacción y las migraciones por el de
sesión, porque el primero no admite `CREATE TABLE`. Con una sola URL el servicio
arranca, consulta bien, y muere el día que hay una migración pendiente.

El paso completo, con lo que cuesta averiguar de cada proveedor, en
[`docs/despliegue.md`](./docs/despliegue.md).

---

## Pila

NestJS · Prisma 7 · PostgreSQL · TypeScript

Prisma 7 movió la URL de conexión fuera del esquema: vive en `prisma.config.ts`
y el cliente se construye con un adaptador de driver.
📖 [Upgrade to Prisma ORM 7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)
