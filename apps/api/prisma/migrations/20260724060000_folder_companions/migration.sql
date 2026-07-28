-- AlterTable
ALTER TABLE "asset_folders" ADD COLUMN "portrait_asset_id" TEXT;
ALTER TABLE "asset_folders" ADD COLUMN "background_asset_id" TEXT;

-- CreateIndex
CREATE INDEX "asset_folders_portrait_asset_id_idx" ON "asset_folders"("portrait_asset_id");
CREATE INDEX "asset_folders_background_asset_id_idx" ON "asset_folders"("background_asset_id");

-- AddForeignKey
ALTER TABLE "asset_folders" ADD CONSTRAINT "asset_folders_portrait_asset_id_fkey" FOREIGN KEY ("portrait_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "asset_folders" ADD CONSTRAINT "asset_folders_background_asset_id_fkey" FOREIGN KEY ("background_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
