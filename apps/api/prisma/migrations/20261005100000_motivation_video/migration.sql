-- Короткие видео Вдохновения (VED-246): отдельная лента «Видео».
CREATE TABLE "public"."MotivationVideo" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MotivationVideo_pkey" PRIMARY KEY ("id")
);

-- Лента идёт от новых к старым с курсором (createdAt, id): вся и по папке.
CREATE INDEX "MotivationVideo_createdAt_id_idx"
    ON "public"."MotivationVideo"("createdAt", "id");
CREATE INDEX "MotivationVideo_category_createdAt_id_idx"
    ON "public"."MotivationVideo"("category", "createdAt", "id");
