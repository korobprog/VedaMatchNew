-- Фоновая музыка Вдохновения: свои записи сервиса, не связанные с Музыкой.
CREATE TABLE "public"."MotivationAudio" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MotivationAudio_pkey" PRIMARY KEY ("id")
);

-- Лента спрашивает только включённые и в заданном порядке.
CREATE INDEX "MotivationAudio_isActive_sortOrder_idx"
    ON "public"."MotivationAudio"("isActive", "sortOrder");
