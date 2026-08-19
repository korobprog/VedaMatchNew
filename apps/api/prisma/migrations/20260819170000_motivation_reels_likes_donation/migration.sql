-- Лента-рилсы: лайки со счётчиком, отметка последнего визита для яруса
-- «свежее» и реквизиты пожертвований в глобальных настройках.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md: `migrate dev` дописал
-- бы сюда удаление триграм-индексов и generated-колонки searchVector.

-- AlterTable
ALTER TABLE "public"."AppSettings"
  ADD COLUMN "donationEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "donationRequisites" JSONB,
  ADD COLUMN "donationText" TEXT;

-- AlterTable
ALTER TABLE "public"."MotivationPost" ADD COLUMN "likeCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."MotivationPreference" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."MotivationLike" (
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MotivationLike_pkey" PRIMARY KEY ("userId","postId")
);

-- CreateIndex
CREATE INDEX "MotivationLike_postId_createdAt_idx" ON "public"."MotivationLike"("postId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."MotivationLike" ADD CONSTRAINT "MotivationLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MotivationLike" ADD CONSTRAINT "MotivationLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."MotivationPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
