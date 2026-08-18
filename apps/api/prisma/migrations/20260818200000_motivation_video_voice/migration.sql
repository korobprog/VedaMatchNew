-- Озвучка цитаты и длина ролика.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md: `migrate dev` дописал
-- бы сюда удаление триграм-индексов и generated-колонки searchVector.

-- AlterTable
ALTER TABLE "public"."MotivationPost"
  ADD COLUMN "videoVoice" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "videoSeconds" INTEGER;
