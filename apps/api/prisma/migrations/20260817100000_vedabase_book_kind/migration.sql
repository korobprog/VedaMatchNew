-- CreateEnum
CREATE TYPE "public"."VedabaseBookKind" AS ENUM ('scripture', 'teaching', 'biography', 'other');

-- AlterTable
-- По умолчанию `teaching`: существующие книги продолжают участвовать в подборе
-- цитат, а биографии администратор помечает вручную.
ALTER TABLE "public"."VedabaseBook"
  ADD COLUMN "kind" "public"."VedabaseBookKind" NOT NULL DEFAULT 'teaching';
