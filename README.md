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

53 tests contra Postgres de verdad, no contra dobles. No es purismo: buena parte
de lo que hay que probar **es** la base, y un doble no tiene triggers. Un test
que pasara con un doble no diría nada sobre si el libro cuadra.

El motor registra movimientos, deriva saldos e invierte transacciones para
corregir errores. Dos cosas que deliberadamente **no** hace: guardar saldos, y
decidir si un movimiento está permitido. Lo segundo es una política, no
contabilidad, y llega en la fase 2 junto con el bloqueo que la hace correcta
bajo concurrencia — comprobar el saldo y escribir sin bloquear la fila es justo
el error que la fase 2 existe para demostrar.

Lo que viene:

| Fase | Qué                                                                                    |
| ---- | -------------------------------------------------------------------------------------- |
| 2    | Transferencias, idempotencia y **concurrencia** — el test de las cincuenta en paralelo |
| 3    | Extracto con paginación por cursor y saldo a fecha                                     |
| 4    | Interfaz                                                                               |
| 5    | Auditoría y conciliación                                                               |

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

Fase 2, y es el que separa a quien ha pensado el problema de quien no:

> Una cuenta con $100. Cincuenta transferencias de $10 **en paralelo**.
> Exactamente diez tienen éxito, cuarenta fallan, el saldo queda en cero y
> nunca en negativo.

---

## Cómo correrlo

```bash
pnpm install
pnpm db:up          # Postgres en el 5433
pnpm db:migrate
pnpm test           # crea la base de pruebas y la migra por su cuenta
```

El puerto es el 5433 y no el 5432 para no chocar con otras bases en la misma
máquina.

Los tests usan una base aparte, `arca_test`, y la vacían entre casos. El
arranque de Vitest la crea si no existe y se niega a arrancar si alguien apunta
`TEST_DATABASE_URL` a la de desarrollo.

---

## Pila

NestJS · Prisma 7 · PostgreSQL · TypeScript

Prisma 7 movió la URL de conexión fuera del esquema: vive en `prisma.config.ts`
y el cliente se construye con un adaptador de driver.
📖 [Upgrade to Prisma ORM 7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)
