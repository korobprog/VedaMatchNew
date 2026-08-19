-- Своя картинка для рилса: откуда взялся кадр.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md: `migrate dev` дописал
-- бы сюда удаление триграм-индексов и generated-колонки searchVector.

-- CreateEnum
CREATE TYPE "public"."MotivationImageSource" AS ENUM ('generated', 'uploaded');

-- AlterTable
ALTER TABLE "public"."MotivationPost"
  ADD COLUMN "imageSource" "public"."MotivationImageSource" NOT NULL DEFAULT 'generated';
