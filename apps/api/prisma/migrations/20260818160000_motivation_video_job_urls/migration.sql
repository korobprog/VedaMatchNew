-- Ссылки на статус и результат задачи у провайдера.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md: `migrate dev` дописал
-- бы сюда удаление триграм-индексов и generated-колонки searchVector.

-- AlterTable
ALTER TABLE "public"."MotivationPost"
  ADD COLUMN "videoJobStatusUrl" TEXT,
  ADD COLUMN "videoJobResultUrl" TEXT;
