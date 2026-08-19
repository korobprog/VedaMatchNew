-- Тумблер уведомлений «Мотивация»: судьба своих рилсов.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md: `migrate dev` дописал
-- бы сюда удаление триграм-индексов и generated-колонки searchVector.

-- AlterTable
ALTER TABLE "public"."NotificationPreference" ADD COLUMN "motivation" BOOLEAN NOT NULL DEFAULT true;
