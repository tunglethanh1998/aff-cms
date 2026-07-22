-- CreateTable
CREATE TABLE "tiktok_videos" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "tiktok_video_id" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "cover_url" TEXT,
    "share_url" TEXT,
    "embed_link" TEXT,
    "duration_sec" INTEGER,
    "view_count" BIGINT NOT NULL DEFAULT 0,
    "like_count" BIGINT NOT NULL DEFAULT 0,
    "comment_count" BIGINT NOT NULL DEFAULT 0,
    "share_count" BIGINT NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tiktok_videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tiktok_videos_account_id_published_at_idx" ON "tiktok_videos"("account_id", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "tiktok_videos_account_id_tiktok_video_id_key" ON "tiktok_videos"("account_id", "tiktok_video_id");

-- AddForeignKey
ALTER TABLE "tiktok_videos" ADD CONSTRAINT "tiktok_videos_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "tiktok_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
