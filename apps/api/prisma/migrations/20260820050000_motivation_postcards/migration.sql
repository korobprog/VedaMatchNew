-- Открытки: справочник праздников и готовый кадр-открытка у поста.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md: `migrate dev` дописал
-- бы сюда удаление триграм-индексов и generated-колонки searchVector.

-- CreateTable
CREATE TABLE "public"."MotivationEvent" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "greeting" TEXT,
    "leadDays" INTEGER NOT NULL DEFAULT 3,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MotivationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MotivationEvent_date_title_key" ON "public"."MotivationEvent"("date", "title");

-- CreateIndex
CREATE INDEX "MotivationEvent_enabled_date_idx" ON "public"."MotivationEvent"("enabled", "date");

-- AlterTable
ALTER TABLE "public"."MotivationPost"
  ADD COLUMN "postcardImageUrl" TEXT,
  ADD COLUMN "postcardEventTitle" TEXT;
