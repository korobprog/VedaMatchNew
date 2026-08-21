-- Пользовательские рилсы: автор и происхождение поста, рубильник, дневной
-- лимит и ИИ-модерация в настройках сервиса.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md: `migrate dev` дописал
-- бы сюда удаление триграм-индексов и generated-колонки searchVector.

-- CreateEnum
CREATE TYPE "public"."MotivationPostOrigin" AS ENUM ('editorial', 'user');

-- CreateEnum
CREATE TYPE "public"."MotivationAiModerationMode" AS ENUM ('off', 'assist', 'autonomous');

-- AlterTable
ALTER TABLE "public"."MotivationPost"
  ADD COLUMN "origin" "public"."MotivationPostOrigin" NOT NULL DEFAULT 'editorial',
  ADD COLUMN "authorUserId" TEXT;

-- AlterTable
ALTER TABLE "public"."MotivationSettings"
  ADD COLUMN "userReelsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "userDailyLimit" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "aiModerationMode" "public"."MotivationAiModerationMode" NOT NULL DEFAULT 'assist',
  ADD COLUMN "aiApproveThreshold" DECIMAL(3,2) NOT NULL DEFAULT 0.75,
  ADD COLUMN "aiRejectThreshold" DECIMAL(3,2) NOT NULL DEFAULT 0.85,
  ADD COLUMN "aiEditorialRules" TEXT;

-- CreateIndex
CREATE INDEX "MotivationPost_authorUserId_createdAt_idx" ON "public"."MotivationPost"("authorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."MotivationPost" ADD CONSTRAINT "MotivationPost_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
