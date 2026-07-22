/*
  Warnings:

  - You are about to drop the `health_checks` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN');

-- CreateEnum
CREATE TYPE "DraftJobStatus" AS ENUM ('PENDING', 'UPLOADING', 'SENT_TO_INBOX', 'FAILED');

-- DropTable
DROP TABLE "health_checks";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiktok_accounts" (
    "id" TEXT NOT NULL,
    "open_id" TEXT NOT NULL,
    "username" TEXT,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "follower_count" BIGINT NOT NULL DEFAULT 0,
    "video_count" BIGINT NOT NULL DEFAULT 0,
    "likes_count" BIGINT NOT NULL DEFAULT 0,
    "view_count" BIGINT NOT NULL DEFAULT 0,
    "comment_count" BIGINT NOT NULL DEFAULT 0,
    "access_token_enc" TEXT NOT NULL,
    "refresh_token_enc" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tiktok_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiktok_draft_jobs" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "caption" TEXT,
    "local_file_name" TEXT NOT NULL,
    "tiktok_publish_id" TEXT,
    "status" "DraftJobStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tiktok_draft_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tiktok_accounts_open_id_key" ON "tiktok_accounts"("open_id");

-- CreateIndex
CREATE INDEX "tiktok_draft_jobs_account_id_idx" ON "tiktok_draft_jobs"("account_id");

-- AddForeignKey
ALTER TABLE "tiktok_draft_jobs" ADD CONSTRAINT "tiktok_draft_jobs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "tiktok_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
