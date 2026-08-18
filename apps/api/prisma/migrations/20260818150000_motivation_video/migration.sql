-- Оживление иллюстрации поста: статус, ссылка и учёт стоимости.
--
-- Миграция написана вручную, а не сгенерирована `migrate dev`: diff-движок
-- дописывает сюда удаление триграм-индексов и generated-колонки searchVector,
-- см. docs/prisma-raw-sql-objects.md. Здесь только аддитивные операторы.

-- CreateEnum
CREATE TYPE "public"."MotivationVideoStatus" AS ENUM ('none', 'queued', 'running', 'review', 'ready', 'failed');

-- AlterTable
ALTER TABLE "public"."MotivationPost"
  ADD COLUMN "videoUrl" TEXT,
  ADD COLUMN "videoStatus" "public"."MotivationVideoStatus" NOT NULL DEFAULT 'none',
  ADD COLUMN "videoJobId" TEXT,
  ADD COLUMN "videoErrorCode" TEXT,
  ADD COLUMN "videoAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "videoCostUsd" DECIMAL(12,6) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "MotivationPost_videoStatus_updatedAt_idx" ON "public"."MotivationPost"("videoStatus", "updatedAt");
