-- CreateEnum
CREATE TYPE "DailyProductStatus" AS ENUM ('PENDING', 'SYNCING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "daily_products" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "slot" INTEGER NOT NULL,
    "product_url" TEXT NOT NULL,
    "title" TEXT,
    "folder_id" TEXT NOT NULL,
    "status" "DailyProductStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "image_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_products_date_idx" ON "daily_products"("date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_products_date_slot_key" ON "daily_products"("date", "slot");

-- AddForeignKey
ALTER TABLE "daily_products" ADD CONSTRAINT "daily_products_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "asset_folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
