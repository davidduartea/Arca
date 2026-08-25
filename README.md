# Arca

Un libro contable por partida doble, con una idea en el centro:

> **El saldo no se guarda en ninguna parte.** Se deriva sumando los asientos.

Un campo `balance` es un dato duplicado, y un dato duplicado acaba
desincronizado. Con dinero, eso significa que el banco y el cliente dejan de
estar de acuerdo en cuánto hay.

---

## La invariante

Cada transacción son **dos o más asientos que suman cero**. Una transferencia de
50 € no es «restar aquí, sumar allá»: es una transacción con dos líneas que se
guardan juntas o no se guarda ninguna.

```
transacción «transferencia de 50 €»
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

## Las otras tres decisiones

**El dinero es un entero.** `10,50 €` se guarda como `1050` céntimos. Nunca un
decimal: `0.1 + 0.2` no es `0.3` en coma flotante, y esa diferencia se acumula
hasta que los libros dejan de cuadrar.

**Los asientos son inmutables.** No hay `UPDATE` ni `DELETE` — hay un trigger
que los rechaza. Un error se corrige con una transacción que invierte los
importes, de modo que el histórico cuenta lo que pasó de verdad, incluido el
error. Que es justo lo que se le pide a un libro contable.

**Idempotencia en la escritura.** El cliente manda una clave; si reintenta
porque se le cayó la red, no se cobra dos veces.

---

## Estado

**Fase 0 · esquema e invariante** — hecho

Comprobado contra Postgres real: se rechazan las transacciones descuadradas, las
de un solo asiento y los importes de cero; se rechaza editar o borrar asientos;
el saldo se deriva correctamente.

Lo que viene:

| Fase | Qué                                                                                          |
| ---- | -------------------------------------------------------------------------------------------- |
| 1    | Motor de asientos: registrar transacciones, derivar saldos, correcciones por asiento inverso |
| 2    | Transferencias, idempotencia y **concurrencia** — el test de las cincuenta en paralelo       |
| 3    | Extracto con paginación por cursor y saldo a fecha                                           |
| 4    | Interfaz                                                                                     |
| 5    | Auditoría y conciliación                                                                     |

### El test que define el proyecto

Fase 2, y es el que separa a quien ha pensado el problema de quien no:

> Una cuenta con 100 €. Cincuenta transferencias de 10 € **en paralelo**.
> Exactamente diez tienen éxito, cuarenta fallan, el saldo queda en cero y
> nunca en negativo.

---

## Cómo correrlo

```bash
pnpm install
pnpm db:up          # Postgres en el 5433
pnpm db:migrate
```

El puerto es el 5433 y no el 5432 para no chocar con otras bases en la misma
máquina.

---

## Pila

NestJS · Prisma 7 · PostgreSQL · TypeScript

Prisma 7 movió la URL de conexión fuera del esquema: vive en `prisma.config.ts`
y el cliente se construye con un adaptador de driver.
📖 [Upgrade to Prisma ORM 7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)
