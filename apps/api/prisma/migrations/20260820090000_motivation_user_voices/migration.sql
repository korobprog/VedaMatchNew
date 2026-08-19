-- Голоса озвучки, доступные автору рилса, и предвыбранный из них.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md: `migrate dev` дописал
-- бы сюда удаление триграм-индексов и generated-колонки searchVector.

-- AlterTable
ALTER TABLE "public"."MotivationSettings"
  ADD COLUMN "userVoices" TEXT[],
  ADD COLUMN "userVoiceDefault" TEXT;
