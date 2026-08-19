-- Музыкальная подложка конкретного ролика.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md: `migrate dev` дописал
-- бы сюда удаление триграм-индексов и generated-колонки searchVector.

-- AlterTable
ALTER TABLE "public"."MotivationPost" ADD COLUMN "videoTrackId" TEXT;

-- AddForeignKey
ALTER TABLE "public"."MotivationPost" ADD CONSTRAINT "MotivationPost_videoTrackId_fkey" FOREIGN KEY ("videoTrackId") REFERENCES "public"."MotivationTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
