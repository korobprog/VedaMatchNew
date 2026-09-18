-- VED-165-2: тестировщик попросил назначать корневую категорию («Традицион-
-- ное»/«Современное») исполнителю целиком, а не записи за записью — так
-- новая запись того же исполнителя сразу попадает в нужную вкладку. Колонка
-- аддитивная и допускает NULL: у всех существующих исполнителей корневая не
-- проставлена, это ожидаемо (см. отчёт генератора) и не блокирует миграцию.
-- Написано руками, а не сгенерировано (см. CLAUDE.md).

-- AlterTable
ALTER TABLE "public"."MusicArtist" ADD COLUMN "rootCategoryId" TEXT;

-- CreateIndex
CREATE INDEX "MusicArtist_rootCategoryId_idx" ON "public"."MusicArtist"("rootCategoryId");

-- AddForeignKey
ALTER TABLE "public"."MusicArtist" ADD CONSTRAINT "MusicArtist_rootCategoryId_fkey" FOREIGN KEY ("rootCategoryId") REFERENCES "public"."MusicCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
