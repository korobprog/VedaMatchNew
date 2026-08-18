-- Редактируемый промпт иллюстрации и отдельный промпт движения для видео.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md: `migrate dev` дописал
-- бы сюда удаление триграм-индексов и generated-колонки searchVector.

-- AlterTable
ALTER TABLE "public"."MotivationPost"
  ADD COLUMN "imagePromptEditedAt" TIMESTAMP(3),
  ADD COLUMN "videoPrompt" TEXT;
