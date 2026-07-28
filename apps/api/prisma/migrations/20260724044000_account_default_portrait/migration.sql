-- AlterTable
ALTER TABLE "tiktok_accounts" ADD COLUMN "default_portrait_asset_id" TEXT;

-- AddForeignKey
ALTER TABLE "tiktok_accounts" ADD CONSTRAINT "tiktok_accounts_default_portrait_asset_id_fkey" FOREIGN KEY ("default_portrait_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
