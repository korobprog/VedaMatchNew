-- Ролик из картинки для рилсов участников: рубильник в настройках сервиса.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md: `migrate dev` дописал
-- бы сюда удаление триграм-индексов и generated-колонки searchVector.

-- AlterTable
ALTER TABLE "public"."MotivationSettings" ADD COLUMN "userVideoEnabled" BOOLEAN NOT NULL DEFAULT false;
