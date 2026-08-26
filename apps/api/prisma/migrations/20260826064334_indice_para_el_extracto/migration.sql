-- DropIndex
DROP INDEX "entries_account_id_created_at_idx";

-- CreateIndex
CREATE INDEX "entries_account_id_created_at_id_idx" ON "entries"("account_id", "created_at", "id");
