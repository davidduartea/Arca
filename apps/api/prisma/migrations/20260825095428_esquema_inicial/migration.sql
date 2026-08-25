-- CreateEnum
CREATE TYPE "account_kind" AS ENUM ('USER', 'SYSTEM');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "account_kind" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "idempotency_key" TEXT,
    "description" TEXT NOT NULL,
    "reverses_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entries" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounts_owner_id_idx" ON "accounts"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_idempotency_key_key" ON "transactions"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_reverses_id_key" ON "transactions"("reverses_id");

-- CreateIndex
CREATE INDEX "transactions_created_at_idx" ON "transactions"("created_at");

-- CreateIndex
CREATE INDEX "entries_account_id_created_at_idx" ON "entries"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "entries_transaction_id_idx" ON "entries"("transaction_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reverses_id_fkey" FOREIGN KEY ("reverses_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entries" ADD CONSTRAINT "entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entries" ADD CONSTRAINT "entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- La invariante del libro: los asientos de una transacción suman cero.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Esto vive en la base de datos y no en el código a propósito. Una comprobación
-- en la aplicación protege del camino que uno recuerda proteger; una
-- restricción aquí protege también de la consulta manual a las tres de la
-- mañana, de la migración mal escrita y del script de importación que alguien
-- ejecutará dentro de dos años.
--
-- Con dinero, «casi siempre correcto» no es correcto.

CREATE OR REPLACE FUNCTION assert_transaction_balances()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  descuadre BIGINT;
  lineas    INTEGER;
BEGIN
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO descuadre, lineas
    FROM entries
   WHERE transaction_id = NEW.transaction_id;

  -- Una transacción con un solo asiento no es partida doble: es un movimiento
  -- que sale de la nada o desaparece sin destino.
  IF lineas < 2 THEN
    RAISE EXCEPTION
      'La transacción % tiene % asiento(s): la partida doble exige al menos dos',
      NEW.transaction_id, lineas
      USING ERRCODE = 'check_violation';
  END IF;

  IF descuadre <> 0 THEN
    RAISE EXCEPTION
      'La transacción % descuadra en % céntimos: los asientos deben sumar cero',
      NEW.transaction_id, descuadre
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

-- DEFERRABLE INITIALLY DEFERRED es la clave de todo esto.
--
-- La comprobación se aplaza hasta el COMMIT en vez de correr en cada fila. Sin
-- eso fallaría SIEMPRE: al insertar el primer asiento de una transferencia la
-- suma es -5000, no cero, y el segundo asiento aún no existe.
--
-- Aplazándola, Postgres deja construir la transacción entera y sólo entonces
-- comprueba. Es la diferencia entre una restricción que funciona y una que
-- hace imposible escribir nada.
CREATE CONSTRAINT TRIGGER entries_must_balance
  AFTER INSERT ON entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION assert_transaction_balances();

-- Los asientos son inmutables.
--
-- Un error no se edita ni se borra: se corrige con una transacción que invierte
-- los importes. Así el histórico cuenta lo que pasó de verdad, incluido el
-- error — que es justo lo que se le pide a un libro contable.
CREATE OR REPLACE FUNCTION reject_entry_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Los asientos son inmutables. Para corregir, registra una transacción inversa.'
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER entries_are_immutable
  BEFORE UPDATE OR DELETE ON entries
  FOR EACH ROW
  EXECUTE FUNCTION reject_entry_mutation();

-- Un importe de cero no mueve nada y ensucia el extracto.
ALTER TABLE entries
  ADD CONSTRAINT entries_amount_not_zero CHECK (amount <> 0);
