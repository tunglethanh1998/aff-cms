-- CreateTable
CREATE TABLE "product_prompts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_prompts_category_name_key" ON "product_prompts"("category", "name");

-- CreateIndex
CREATE INDEX "product_prompts_category_updated_at_idx" ON "product_prompts"("category", "updated_at");
