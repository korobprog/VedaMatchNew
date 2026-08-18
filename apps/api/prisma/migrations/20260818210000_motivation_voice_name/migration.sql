-- Выбор голоса озвучки у поста.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md.

-- AlterTable
ALTER TABLE "public"."MotivationPost" ADD COLUMN "videoVoiceName" TEXT;
