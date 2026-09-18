-- VED-165: у раздела каталога появляется вид — корневая категория витрины
-- («Традиционное», «Современное») или прежний плоский стиль (киртан,
-- бхаджан, мантра…), ушедший в фильтр. Написано руками (см. CLAUDE.md и
-- память проекта про `migrate dev`), а не сгенерировано.
--
-- Дефолт `style` у нового поля делает миграцию безопасной без бэкофилла:
-- все пять существующих строк остаются как есть, ничего руками не
-- проставляем. Две корневые строки заводит сид (`music-categories-data.js`).

-- CreateEnum
CREATE TYPE "public"."MusicCategoryKind" AS ENUM ('root', 'style');

-- AlterTable
ALTER TABLE "public"."MusicCategory" ADD COLUMN "kind" "public"."MusicCategoryKind" NOT NULL DEFAULT 'style';

-- CreateIndex
CREATE INDEX "MusicCategory_kind_idx" ON "public"."MusicCategory"("kind");
