-- DropForeignKey
ALTER TABLE "tiktok_accounts" DROP CONSTRAINT IF EXISTS "tiktok_accounts_default_portrait_asset_id_fkey";

-- AlterTable
ALTER TABLE "tiktok_accounts" DROP COLUMN IF EXISTS "default_portrait_asset_id";
