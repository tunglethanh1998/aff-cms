-- AlterTable
ALTER TABLE "asset_folders" ADD COLUMN     "account_id" TEXT;

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "account_id" TEXT;

-- CreateIndex
CREATE INDEX "asset_folders_account_id_parent_id_idx" ON "asset_folders"("account_id", "parent_id");

-- CreateIndex
CREATE INDEX "assets_account_id_created_at_idx" ON "assets"("account_id", "created_at");

-- AddForeignKey
ALTER TABLE "asset_folders" ADD CONSTRAINT "asset_folders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "tiktok_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "tiktok_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
