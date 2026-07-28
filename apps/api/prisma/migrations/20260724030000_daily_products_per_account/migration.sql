-- Drop shared uniqueness; daily products become per-account.
DELETE FROM "daily_products";

DROP INDEX IF EXISTS "daily_products_date_slot_key";
DROP INDEX IF EXISTS "daily_products_date_idx";

ALTER TABLE "daily_products" ADD COLUMN "account_id" TEXT NOT NULL;

CREATE INDEX "daily_products_account_id_date_idx" ON "daily_products"("account_id", "date");

CREATE UNIQUE INDEX "daily_products_account_id_date_slot_key" ON "daily_products"("account_id", "date", "slot");

ALTER TABLE "daily_products" ADD CONSTRAINT "daily_products_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "tiktok_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
